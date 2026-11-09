import type { OpenPlayStatus, PrismaClient } from '@pbl/database';
import {
  AppError,
  ErrorCode,
  type Actor,
  type AddParticipantsBody,
  type CreateSessionBody,
  type UpdateSessionBody,
} from '@pbl/shared';
import { writeAudit } from '../../lib/audit.js';
import * as playersRepo from '../players/repo.js';
import {
  nextWaitlistPos,
  occupiedCount,
  participantStatusForNew,
  shouldWaitlist,
} from './participants.js';
import * as repo from './repo.js';

const TRANSITIONS: Record<OpenPlayStatus, readonly OpenPlayStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['LIVE', 'DRAFT', 'CANCELLED'],
  LIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function assertAdmin(actor: Actor): string {
  if (actor.kind !== 'admin') {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  }
  return actor.userId;
}

function toSessionListItem(s: {
  id: string;
  title: string;
  startsAt: Date;
  venue: string | null;
  courtCount: number;
  capacity: number | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: OpenPlayStatus;
  _count: { participants: number };
}) {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.startsAt.toISOString(),
    venue: s.venue,
    courtCount: s.courtCount,
    capacity: s.capacity,
    visibility: s.visibility,
    status: s.status,
    participantCount: s._count.participants,
  };
}

function toParticipant(p: {
  id: string;
  playerId: string;
  status: string;
  waitlistPos: number | null;
  joinedAt: Date;
  leftAt: Date | null;
  player: { displayName: string };
}) {
  return {
    id: p.id,
    playerId: p.playerId,
    displayName: p.player.displayName,
    status: p.status,
    waitlistPos: p.waitlistPos,
    joinedAt: p.joinedAt.toISOString(),
    leftAt: p.leftAt?.toISOString() ?? null,
  };
}

function toSessionDetail(s: NonNullable<Awaited<ReturnType<typeof repo.findSession>>>) {
  return {
    ...toSessionListItem({ ...s, _count: { participants: s.participants.length } }),
    defaultMode: s.defaultMode,
    participants: s.participants.map(toParticipant),
  };
}

function guestCanView(visibility: 'PUBLIC' | 'PRIVATE', actor: Actor): boolean {
  return visibility === 'PUBLIC' || actor.kind === 'admin';
}

export async function listSessions(prisma: PrismaClient, actor: Actor) {
  const where = actor.kind === 'admin' ? {} : { visibility: 'PUBLIC' as const };
  const rows = await repo.listSessions(prisma, where);
  return rows.map(toSessionListItem);
}

export async function getSession(prisma: PrismaClient, actor: Actor, id: string) {
  const session = await repo.findSession(prisma, id);
  if (session === null || !guestCanView(session.visibility, actor)) {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  return toSessionDetail(session);
}

export async function createSession(
  prisma: PrismaClient,
  actor: Actor,
  body: CreateSessionBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const session = await repo.createSession(prisma, {
    title: body.title,
    startsAt: new Date(body.startsAt),
    courtCount: body.courtCount,
    createdById: adminId,
    status: 'DRAFT',
    visibility: body.visibility ?? 'PUBLIC',
    defaultMode: body.defaultMode ?? 'BALANCED_ELO',
    ...(body.venue !== undefined ? { venue: body.venue } : {}),
    ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'session.create',
    entityType: 'OpenPlay',
    entityId: session.id,
    requestId: audit.requestId,
  });
  const full = await repo.findSession(prisma, session.id);
  if (full === null) throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Session create failed');
  return toSessionDetail(full);
}

export async function updateSession(
  prisma: PrismaClient,
  actor: Actor,
  id: string,
  body: UpdateSessionBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const existing = await repo.findSession(prisma, id);
  if (existing === null) {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  if (body.status !== undefined && body.status !== existing.status) {
    const allowed = TRANSITIONS[existing.status];
    if (!allowed.includes(body.status)) {
      throw new AppError(
        ErrorCode.INVALID_STATUS_TRANSITION,
        409,
        `Cannot move from ${existing.status} to ${body.status}`,
      );
    }
  }
  const data: Parameters<typeof repo.updateSession>[2] = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt);
  if (body.venue !== undefined) data.venue = body.venue;
  if (body.courtCount !== undefined) data.courtCount = body.courtCount;
  if (body.capacity !== undefined) data.capacity = body.capacity;
  if (body.visibility !== undefined) data.visibility = body.visibility;
  if (body.defaultMode !== undefined) data.defaultMode = body.defaultMode;
  if (body.status !== undefined) data.status = body.status;
  await repo.updateSession(prisma, id, data);
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'session.update',
    entityType: 'OpenPlay',
    entityId: id,
    before: { status: existing.status },
    after: { status: body.status ?? existing.status },
    requestId: audit.requestId,
  });
  const full = await repo.findSession(prisma, id);
  if (full === null) throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Session update failed');
  return toSessionDetail(full);
}

export async function addParticipants(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  body: AddParticipantsBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const session = await repo.findSession(prisma, sessionId);
  if (session === null) {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION, 409, 'Session is closed');
  }
  const uniqueIds = [...new Set(body.playerIds)];
  for (const playerId of uniqueIds) {
    const player = await playersRepo.findPlayer(prisma, playerId);
    if (player === null || !player.active) {
      throw new AppError(ErrorCode.PLAYER_NOT_FOUND, 404, `Player ${playerId} not found`);
    }
  }

  let occupied = await occupiedCount(prisma, sessionId);
  const created = [];
  for (const playerId of uniqueIds) {
    const split = shouldWaitlist(session.capacity, occupied, 1);
    const wait = split.waitlisted === 1;
    const status = participantStatusForNew(session.status, wait);
    const waitlistPos = wait ? await nextWaitlistPos(prisma, sessionId) : null;
    if (!wait) occupied++;
    const row = await repo.upsertParticipant(prisma, {
      openPlayId: sessionId,
      playerId,
      status,
      waitlistPos,
    });
    created.push(toParticipant(row));
  }

  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'session.participants.add',
    entityType: 'OpenPlay',
    entityId: sessionId,
    after: { playerIds: uniqueIds },
    requestId: audit.requestId,
  });

  return { participants: created };
}

export async function removeParticipant(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  playerId: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const row = await repo.findParticipant(prisma, sessionId, playerId);
  if (row === null) {
    throw new AppError(ErrorCode.PARTICIPANT_NOT_FOUND, 404, 'Participant not found');
  }
  const updated = await repo.updateParticipant(prisma, row.id, {
    status: 'REMOVED',
    waitlistPos: null,
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'session.participant.remove',
    entityType: 'OpenPlayParticipant',
    entityId: row.id,
    requestId: audit.requestId,
  });
  return toParticipant(updated);
}

export async function patchParticipant(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  playerId: string,
  status: 'UNAVAILABLE' | 'LEFT' | 'REMOVED' | 'REGISTERED' | 'ACTIVE',
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const session = await repo.findSession(prisma, sessionId);
  if (session === null) {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  const row = await repo.findParticipant(prisma, sessionId, playerId);
  if (row === null) {
    throw new AppError(ErrorCode.PARTICIPANT_NOT_FOUND, 404, 'Participant not found');
  }

  let targetStatus = status;
  if (row.status === 'WAITLISTED' && (status === 'REGISTERED' || status === 'ACTIVE')) {
    targetStatus = session.status === 'LIVE' ? 'ACTIVE' : 'REGISTERED';
  }
  const data: Parameters<typeof repo.updateParticipant>[2] = { status: targetStatus };
  if (targetStatus === 'LEFT') data.leftAt = new Date();
  if (targetStatus === 'REGISTERED' || targetStatus === 'ACTIVE') {
    data.waitlistPos = null;
    data.leftAt = null;
  }

  const updated = await repo.updateParticipant(prisma, row.id, data);
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'session.participant.patch',
    entityType: 'OpenPlayParticipant',
    entityId: row.id,
    after: { status: updated.status },
    requestId: audit.requestId,
  });
  return toParticipant(updated);
}

export async function promoteParticipant(
  prisma: PrismaClient,
  actor: Actor,
  sessionId: string,
  playerId: string,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const session = await repo.findSession(prisma, sessionId);
  if (session === null) {
    throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, 'Session not found');
  }
  const row = await repo.findParticipant(prisma, sessionId, playerId);
  if (row === null || row.status !== 'WAITLISTED') {
    throw new AppError(ErrorCode.PARTICIPANT_NOT_FOUND, 409, 'Player is not on the waiting list');
  }
  const target = session.status === 'LIVE' ? 'ACTIVE' : 'REGISTERED';
  const updated = await repo.updateParticipant(prisma, row.id, {
    status: target,
    waitlistPos: null,
    leftAt: null,
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'session.participant.promote',
    entityType: 'OpenPlayParticipant',
    entityId: row.id,
    requestId: audit.requestId,
  });
  return toParticipant(updated);
}
