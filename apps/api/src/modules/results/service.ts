import type { Prisma, PrismaClient } from '@pbl/database';
import type { TeamSide } from '@pbl/elo-engine';
import {
  AppError,
  ErrorCode,
  type Actor,
  type CancelMatchBody,
  type ConfirmAllBody,
  type ConfirmMatchBody,
  type CorrectMatchBody,
} from '@pbl/shared';
import { hashRequestBody, runIdempotent } from '../../lib/idempotency.js';
import { writeAudit } from '../../lib/audit.js';
import { applyConfirmedMatchRatings, replayFromOrderKey } from '../ratings/apply.js';
import { buildMatchResult } from '../ratings/match-result.js';
import type { TransactionClient } from '../../lib/transaction-client.js';
import { ratingChangesFromHistory, toMatchResultPayload } from './serialize.js';

function assertAdmin(actor: Actor): string {
  if (actor.kind !== 'admin') throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  return actor.userId;
}

async function lockMatch(tx: TransactionClient, matchId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
}

type MatchRow = NonNullable<Awaited<ReturnType<typeof loadMatch>>>;

async function loadMatch(prisma: PrismaClient | TransactionClient, matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      assignments: {
        where: { status: 'PLAYING' },
        orderBy: [{ team: 'asc' }, { position: 'asc' }],
      },
    },
  });
}

function assertConfirmable(match: MatchRow, winnerTeam: TeamSide): void {
  if (match.cancelledAt !== null) {
    throw new AppError(ErrorCode.MATCH_NOT_CONFIRMABLE, 409, 'Match is cancelled');
  }
  if (match.status === 'COMPLETED') {
    if (match.winnerTeam === winnerTeam) return;
    throw new AppError(
      ErrorCode.MATCH_ALREADY_CONFIRMED,
      409,
      'Match already confirmed; use correct to change the winner',
    );
  }
  if (match.status !== 'SCHEDULED' && match.status !== 'IN_PROGRESS') {
    throw new AppError(ErrorCode.MATCH_NOT_CONFIRMABLE, 409, 'Match cannot be confirmed');
  }
}

async function completeMatch(
  tx: TransactionClient,
  match: MatchRow,
  winnerTeam: TeamSide,
  adminId: string,
): Promise<void> {
  await tx.match.update({
    where: { id: match.id },
    data: {
      status: 'COMPLETED',
      winnerTeam,
      confirmedById: adminId,
      confirmedAt: new Date(),
    },
  });
}

async function buildResponse(
  prisma: PrismaClient | TransactionClient,
  matchId: string,
  ratingChanges: ReturnType<typeof ratingChangesFromHistory>,
) {
  const match = await loadMatch(prisma, matchId);
  if (match === null) throw new AppError(ErrorCode.MATCH_NOT_FOUND, 404, 'Match not found');
  return toMatchResultPayload({
    id: match.id,
    roundId: match.roundId,
    courtNumber: match.courtNumber,
    status: match.status,
    winnerTeam: match.winnerTeam,
    confirmedAt: match.confirmedAt,
    ratingChanges,
  });
}

export async function confirmMatch(
  prisma: PrismaClient,
  actor: Actor,
  matchId: string,
  body: ConfirmMatchBody,
  idempotencyKey: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const requestHash = hashRequestBody(body);
  const scope = `POST /matches/${matchId}/confirm:${adminId}`;

  const result = await runIdempotent({
    prisma,
    scope,
    key: idempotencyKey,
    requestHash,
    run: async (tx) => {
      await lockMatch(tx, matchId);
      const match = await loadMatch(tx, matchId);
      if (match === null) throw new AppError(ErrorCode.MATCH_NOT_FOUND, 404, 'Match not found');

      if (match.status === 'COMPLETED' && match.winnerTeam === body.winnerTeam) {
        return buildResponse(tx, matchId, []);
      }

      assertConfirmable(match, body.winnerTeam);
      await completeMatch(tx, match, body.winnerTeam, adminId);

      const rated = buildMatchResult(match.id, body.winnerTeam, match.assignments);
      const history = await applyConfirmedMatchRatings(tx, rated, match.orderKey, {
        adminId,
        reason: 'confirm',
        triggerMatchId: match.id,
        runKind: 'INCREMENTAL',
      });

      await writeAudit(tx, {
        actorUserId: adminId,
        action: 'match.confirm',
        entityType: 'Match',
        entityId: match.id,
        after: { winnerTeam: body.winnerTeam },
        requestId: audit.requestId,
      });

      return buildResponse(tx, matchId, ratingChangesFromHistory(history, match.id));
    },
    toStored: (value) => ({
      status: 200,
      body: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
    }),
    fromStored: (_s, body) => body as Awaited<ReturnType<typeof buildResponse>>,
  });

  return { match: result.value, replayed: result.replayed };
}

export async function confirmAllRound(
  prisma: PrismaClient,
  actor: Actor,
  roundId: string,
  body: ConfirmAllBody,
  idempotencyKey: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const requestHash = hashRequestBody(body);
  const scope = `POST /rounds/${roundId}/confirm-all:${adminId}`;

  const result = await runIdempotent({
    prisma,
    scope,
    key: idempotencyKey,
    requestHash,
    run: async (tx) => {
      const round = await tx.round.findUnique({
        where: { id: roundId },
        include: { matches: { orderBy: { courtNumber: 'asc' } } },
      });
      if (round === null) throw new AppError(ErrorCode.ROUND_NOT_FOUND, 404, 'Round not found');

      let fromOrderKey: string | null = null;
      const confirmedIds: string[] = [];

      for (const entry of body.results) {
        await lockMatch(tx, entry.matchId);
        const match = await loadMatch(tx, entry.matchId);
        if (match === null || match.roundId !== roundId) {
          throw new AppError(ErrorCode.MATCH_NOT_FOUND, 404, 'Match not in this round');
        }
        if (match.status === 'COMPLETED' && match.winnerTeam === entry.winnerTeam) continue;
        assertConfirmable(match, entry.winnerTeam);
        await completeMatch(tx, match, entry.winnerTeam, adminId);
        confirmedIds.push(match.id);
        if (fromOrderKey === null || match.orderKey < fromOrderKey) fromOrderKey = match.orderKey;
      }

      if (fromOrderKey === null) {
        const matches = [];
        for (const entry of body.results) {
          matches.push(await buildResponse(tx, entry.matchId, []));
        }
        return { matches };
      }

      const history = await replayFromOrderKey(tx, fromOrderKey, {
        adminId,
        reason: 'confirm-all',
        triggerMatchId: roundId,
        runKind: 'REPLAY',
      });

      const matches = [];
      for (const entry of body.results) {
        matches.push(
          await buildResponse(tx, entry.matchId, ratingChangesFromHistory(history, entry.matchId)),
        );
      }

      await writeAudit(tx, {
        actorUserId: adminId,
        action: 'round.confirm-all',
        entityType: 'Round',
        entityId: roundId,
        after: { matchIds: confirmedIds },
        requestId: audit.requestId,
      });

      return { matches };
    },
    toStored: (value) => ({
      status: 200,
      body: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
    }),
    fromStored: (_s, body) => body as { matches: Awaited<ReturnType<typeof buildResponse>>[] },
  });

  return { matches: result.value.matches, replayed: result.replayed };
}

export async function cancelMatch(
  prisma: PrismaClient,
  actor: Actor,
  matchId: string,
  body: CancelMatchBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  return prisma.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const match = await loadMatch(tx, matchId);
    if (match === null) throw new AppError(ErrorCode.MATCH_NOT_FOUND, 404, 'Match not found');
    if (match.status === 'CANCELLED') {
      return buildResponse(tx, matchId, []);
    }

    const wasConfirmed = match.status === 'COMPLETED' && match.winnerTeam !== null;
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: body.reason ?? null,
        winnerTeam: null,
        confirmedAt: null,
        confirmedById: null,
      },
    });

    if (wasConfirmed) {
      await replayFromOrderKey(tx, match.orderKey, {
        adminId,
        reason: 'cancel-confirmed',
        triggerMatchId: match.id,
        runKind: 'REPLAY',
      });
    }

    await writeAudit(tx, {
      actorUserId: adminId,
      action: 'match.cancel',
      entityType: 'Match',
      entityId: matchId,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      requestId: audit.requestId,
    });

    return buildResponse(tx, matchId, []);
  });
}

export async function correctMatch(
  prisma: PrismaClient,
  actor: Actor,
  matchId: string,
  body: CorrectMatchBody,
  idempotencyKey: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const requestHash = hashRequestBody(body);
  const scope = `POST /matches/${matchId}/correct:${adminId}`;

  const result = await runIdempotent({
    prisma,
    scope,
    key: idempotencyKey,
    requestHash,
    run: async (tx) => {
      await lockMatch(tx, matchId);
      const match = await loadMatch(tx, matchId);
      if (match === null) throw new AppError(ErrorCode.MATCH_NOT_FOUND, 404, 'Match not found');
      if (match.status !== 'COMPLETED' || match.winnerTeam === null) {
        throw new AppError(
          ErrorCode.MATCH_NOT_CONFIRMABLE,
          409,
          'Only confirmed matches can be corrected',
        );
      }
      if (match.winnerTeam === body.winnerTeam) {
        return buildResponse(tx, matchId, []);
      }

      await tx.match.update({
        where: { id: matchId },
        data: { winnerTeam: body.winnerTeam },
      });

      const history = await replayFromOrderKey(tx, match.orderKey, {
        adminId,
        reason: body.reason,
        triggerMatchId: match.id,
        runKind: 'REPLAY',
      });

      await writeAudit(tx, {
        actorUserId: adminId,
        action: 'match.correct',
        entityType: 'Match',
        entityId: matchId,
        after: { winnerTeam: body.winnerTeam, reason: body.reason },
        requestId: audit.requestId,
      });

      return buildResponse(tx, matchId, ratingChangesFromHistory(history, match.id));
    },
    toStored: (value) => ({
      status: 200,
      body: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
    }),
    fromStored: (_s, body) => body as Awaited<ReturnType<typeof buildResponse>>,
  });

  return { match: result.value, replayed: result.replayed };
}
