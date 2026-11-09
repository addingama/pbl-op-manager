import { randomUUID } from 'node:crypto';
import { matchOrderKey, type Prisma, type PrismaClient } from '@pbl/database';
import {
  generateRound,
  MatchGeneratorError,
  validateRound,
  type GeneratorMode,
} from '@pbl/match-generator';
import {
  AppError,
  ErrorCode,
  type Actor,
  type GenerateRoundBody,
  type ManualRoundBody,
  type SwapSlotsBody,
} from '@pbl/shared';
import { hashRequestBody, runIdempotent } from '../../lib/idempotency.js';
import { writeAudit } from '../../lib/audit.js';
import { loadEligibleParticipants, loadFixedTeams } from './eligible.js';
import { loadPreviousRounds } from './history.js';
import { persistRound } from './persist.js';
import * as repo from './repo.js';
import { matchesFromManual, toRoundDetail } from './serialize.js';

const GENERATABLE: readonly OpenPlayStatus[] = ['OPEN', 'LIVE'];
type OpenPlayStatus = 'DRAFT' | 'OPEN' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

function assertAdmin(actor: Actor): string {
  if (actor.kind !== 'admin') throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  return actor.userId;
}

async function requireRound(prisma: PrismaClient, roundId: string) {
  const round = await repo.findRound(prisma, roundId);
  if (round === null) throw new AppError(ErrorCode.ROUND_NOT_FOUND, 404, 'Round not found');
  return round;
}

function assertSchedulableSession(status: OpenPlayStatus): void {
  if (!GENERATABLE.includes(status)) {
    throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION, 409, 'Session is not open for rounds');
  }
}

export async function getRound(prisma: PrismaClient, actor: Actor, roundId: string) {
  const round = await requireRound(prisma, roundId);
  if (round.openPlay.visibility === 'PRIVATE' && actor.kind !== 'admin') {
    throw new AppError(ErrorCode.ROUND_NOT_FOUND, 404, 'Round not found');
  }
  return toRoundDetail(round);
}

async function requireSessionForGuest(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
): Promise<{ visibility: 'PUBLIC' | 'PRIVATE' }> {
  const session = await prisma.openPlay.findUnique({
    where: { id: sessionId },
    select: { id: true, visibility: true },
  });
  if (session === null) {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  if (session.visibility === 'PRIVATE' && actor.kind !== 'admin') {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  return session;
}

export async function listSessionRounds(prisma: PrismaClient, actor: Actor, sessionId: string) {
  await requireSessionForGuest(prisma, actor, sessionId);
  const rounds = await repo.listRoundsForSession(prisma, sessionId);
  return rounds.map((round) => toRoundDetail(round));
}

export async function generateSessionRound(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  body: GenerateRoundBody,
  idempotencyKey: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const requestHash = hashRequestBody(body);
  const scope = `POST /sessions/${sessionId}/rounds:${adminId}`;

  const result = await runIdempotent({
    prisma,
    scope,
    key: idempotencyKey,
    requestHash,
    run: async (tx) => {
      await repo.lockOpenPlay(tx, sessionId);
      const session = await tx.openPlay.findUnique({ where: { id: sessionId } });
      if (session === null) {
        throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
      }
      assertSchedulableSession(session.status);

      const max = await repo.lastRoundNumber(tx, sessionId);
      const number = (max._max.number ?? 0) + 1;
      const eligible = await loadEligibleParticipants(tx, sessionId);
      const eligibleIds = eligible.map((p) => p.id);
      const resolvedMode = body.mode ?? session.defaultMode;
      if (resolvedMode === 'MANUAL') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Use manual round endpoint for MANUAL');
      }
      const mode: GeneratorMode = resolvedMode;

      const previousRounds = await loadPreviousRounds(tx, sessionId);
      const seed = body.seed ?? randomUUID();
      const fixedTeams =
        mode === 'FIXED_PARTNER' ? [...(await loadFixedTeams(tx, sessionId))] : undefined;

      let generated;
      try {
        generated = generateRound({
          mode,
          courts: session.courtCount,
          seed,
          participants: eligible.map((p) => ({ id: p.id, rating: p.rating })),
          previousRounds,
          ...(fixedTeams !== undefined ? { fixedTeams } : {}),
          ...(body.settings !== undefined ? { settings: body.settings } : {}),
        });
      } catch (error) {
        if (error instanceof MatchGeneratorError) {
          throw new AppError(ErrorCode.GENERATOR_ERROR, 400, error.message, { code: error.code });
        }
        throw error;
      }

      const snapshot = Object.fromEntries(eligible.map((p) => [p.id, p.rating]));
      const roundId = await persistRound(tx, {
        openPlayId: sessionId,
        sessionStartsAt: session.startsAt,
        number,
        mode: generated.mode,
        settings: { ...generated.settings },
        seed: generated.seed,
        ratingSnapshot: snapshot,
        matches: generated.matches,
        resting: generated.resting,
        createdById: adminId,
        courts: session.courtCount,
        eligibleIds,
      });

      await writeAudit(tx, {
        actorUserId: adminId,
        action: 'round.generate',
        entityType: 'Round',
        entityId: roundId,
        after: { number, mode: generated.mode, seed: generated.seed },
        requestId: audit.requestId,
      });

      const round = await repo.findRound(tx, roundId);
      if (round === null) throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Round missing');
      return toRoundDetail(round);
    },
    toStored: (value) => ({
      status: 201,
      body: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
    }),
    fromStored: (_s, body) => body as ReturnType<typeof toRoundDetail>,
  });

  return { round: result.value, replayed: result.replayed, status: 201 as const };
}

export async function createManualRound(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  body: ManualRoundBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  return prisma.$transaction(async (tx) => {
    await repo.lockOpenPlay(tx, sessionId);
    const session = await tx.openPlay.findUnique({ where: { id: sessionId } });
    if (session === null) throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
    assertSchedulableSession(session.status);

    const eligible = await loadEligibleParticipants(tx, sessionId);
    const eligibleIds = eligible.map((p) => p.id);
    const matches = matchesFromManual(body.matches);
    const snapshot = Object.fromEntries(eligible.map((p) => [p.id, p.rating]));
    const max = await repo.lastRoundNumber(tx, sessionId);
    const number = (max._max.number ?? 0) + 1;

    const roundId = await persistRound(tx, {
      openPlayId: sessionId,
      sessionStartsAt: session.startsAt,
      number,
      mode: 'MANUAL',
      settings: {},
      seed: null,
      ratingSnapshot: snapshot,
      matches,
      resting: body.resting ?? [],
      createdById: adminId,
      courts: session.courtCount,
      eligibleIds,
    });

    await writeAudit(tx, {
      actorUserId: adminId,
      action: 'round.manual',
      entityType: 'Round',
      entityId: roundId,
      requestId: audit.requestId,
    });

    const round = await repo.findRound(tx, roundId);
    if (round === null) throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Round missing');
    return toRoundDetail(round);
  });
}

export async function updateManualRound(
  prisma: PrismaClient,
  actor: Actor,
  roundId: string,
  body: ManualRoundBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const existing = await requireRound(prisma, roundId);
  if (existing.mode !== 'MANUAL') {
    throw new AppError(ErrorCode.ROUND_NOT_EDITABLE, 409, 'Only manual rounds can be edited');
  }
  if (existing.matches.some((m) => m.status !== 'SCHEDULED')) {
    throw new AppError(ErrorCode.ROUND_NOT_EDITABLE, 409, 'Round has started matches');
  }

  return prisma.$transaction(async (tx) => {
    await tx.roundAssignment.deleteMany({ where: { roundId } });
    await tx.match.deleteMany({ where: { roundId } });

    const eligible = await loadEligibleParticipants(tx, existing.openPlayId);
    const matches = matchesFromManual(body.matches);
    const courts = existing.openPlay.courtCount;

    const violations = validateRound(
      matches,
      courts,
      eligible.map((p) => p.id),
    );
    if (violations.length > 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Manual round violates constraints', {
        violations,
      });
    }

    for (const match of matches) {
      const orderKey = matchOrderKey(
        existing.openPlay.startsAt,
        existing.openPlayId,
        existing.number,
        match.court,
      );
      const row = await tx.match.create({
        data: { roundId, courtNumber: match.court, orderKey },
      });
      await tx.roundAssignment.createMany({
        data: [match.team1, match.team2].flatMap((team, t) =>
          team.map((playerId, p) => ({
            roundId,
            playerId,
            status: 'PLAYING' as const,
            matchId: row.id,
            team: t + 1,
            position: p + 1,
          })),
        ),
      });
    }
    const playing = new Set(matches.flatMap((m) => [...m.team1, ...m.team2]));
    const rest = body.resting ?? eligible.map((p) => p.id).filter((id) => !playing.has(id));
    if (rest.length > 0) {
      await tx.roundAssignment.createMany({
        data: rest.map((playerId) => ({ roundId, playerId, status: 'RESTING' as const })),
      });
    }

    await tx.round.update({ where: { id: roundId }, data: { version: { increment: 1 } } });
    await writeAudit(tx, {
      actorUserId: adminId,
      action: 'round.manual.edit',
      entityType: 'Round',
      entityId: roundId,
      requestId: audit.requestId,
    });

    const round = await repo.findRound(tx, roundId);
    if (round === null) throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Round missing');
    return toRoundDetail(round);
  });
}

export async function deleteLastUnstartedRound(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const last = await repo.findLastRound(prisma, sessionId);
  if (last === null) throw new AppError(ErrorCode.ROUND_NOT_FOUND, 404, 'No rounds to delete');
  if (last.matches.some((m) => m.status !== 'SCHEDULED')) {
    throw new AppError(ErrorCode.ROUND_NOT_EDITABLE, 409, 'Last round has started matches');
  }
  await prisma.round.delete({ where: { id: last.id } });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'round.delete',
    entityType: 'Round',
    entityId: last.id,
    requestId: audit.requestId,
  });
  return { deletedRoundId: last.id, number: last.number };
}

export async function startRound(
  prisma: PrismaClient,
  actor: Actor,
  roundId: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  await requireRound(prisma, roundId);
  const now = new Date();
  await prisma.match.updateMany({
    where: { roundId, status: 'SCHEDULED' },
    data: { status: 'IN_PROGRESS', startedAt: now },
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'round.start',
    entityType: 'Round',
    entityId: roundId,
    requestId: audit.requestId,
  });
  return getRound(prisma, actor, roundId);
}

export async function startMatch(
  prisma: PrismaClient,
  actor: Actor,
  matchId: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (match === null) throw new AppError(ErrorCode.MATCH_NOT_FOUND, 404, 'Match not found');
  if (match.status !== 'SCHEDULED') {
    throw new AppError(ErrorCode.MATCH_ALREADY_STARTED, 409, 'Match already started');
  }
  await prisma.match.update({
    where: { id: matchId },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'match.start',
    entityType: 'Match',
    entityId: matchId,
    requestId: audit.requestId,
  });
  return getRound(prisma, actor, match.roundId);
}

export async function swapSlots(
  prisma: PrismaClient,
  actor: Actor,
  roundId: string,
  body: SwapSlotsBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: { matches: true, assignments: true },
    });
    if (round === null) throw new AppError(ErrorCode.ROUND_NOT_FOUND, 404, 'Round not found');
    if (round.version !== body.expectedRoundVersion) {
      throw new AppError(ErrorCode.ROUND_CHANGED, 409, 'Round was modified by another change');
    }

    const a = round.assignments.find((row) => row.playerId === body.a.playerId);
    const b = round.assignments.find((row) => row.playerId === body.b.playerId);
    if (a === undefined || b === undefined) {
      throw new AppError(ErrorCode.PARTICIPANT_NOT_FOUND, 404, 'Player not in this round');
    }

    const involved = [a.matchId, b.matchId].filter((id): id is string => id !== null);
    if (involved.length > 0) {
      const matches = await tx.match.findMany({ where: { id: { in: involved } } });
      if (matches.some((m) => m.status !== 'SCHEDULED')) {
        throw new AppError(
          ErrorCode.MATCH_ALREADY_STARTED,
          409,
          'Cannot swap after a match starts',
        );
      }
    }

    const bumped = await tx.round.updateMany({
      where: { id: roundId, version: body.expectedRoundVersion },
      data: { version: { increment: 1 } },
    });
    if (bumped.count !== 1) {
      throw new AppError(ErrorCode.ROUND_CHANGED, 409, 'Round was modified by another change');
    }

    await tx.roundAssignment.update({ where: { id: a.id }, data: { playerId: b.playerId } });
    await tx.roundAssignment.update({ where: { id: b.id }, data: { playerId: a.playerId } });

    await writeAudit(tx, {
      actorUserId: adminId,
      action: 'round.swap',
      entityType: 'Round',
      entityId: roundId,
      after: { a: body.a.playerId, b: body.b.playerId },
      requestId: audit.requestId,
    });

    const fresh = await repo.findRound(tx, roundId);
    if (fresh === null) throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Round missing');
    return toRoundDetail(fresh);
  });
}
