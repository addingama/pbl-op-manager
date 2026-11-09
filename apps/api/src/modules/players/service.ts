import type { PrismaClient } from '@pbl/database';
import {
  AppError,
  ErrorCode,
  levenshtein,
  normalizeDisplayName,
  type Actor,
  type CreatePlayerBody,
  type UpdatePlayerBody,
} from '@pbl/shared';
import { rankingStatus } from '@pbl/elo-engine';
import { isRanked, ratingNumber } from '../../lib/ranked.js';
import { rankForPlayer } from '../leaderboard/rank.js';
import { writeAudit } from '../../lib/audit.js';
import * as repo from './repo.js';

const SIMILAR_THRESHOLD = 2;

function assertAdmin(actor: Actor): string {
  if (actor.kind !== 'admin') {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  }
  return actor.userId;
}

export function toPlayerListItem(p: {
  id: string;
  displayName: string;
  rating: { toFixed(n: number): string };
  matchesPlayed: number;
  active: boolean;
}) {
  return {
    id: p.id,
    displayName: p.displayName,
    rating: ratingNumber(p.rating),
    matchesPlayed: p.matchesPlayed,
    active: p.active,
    ranked: isRanked(p.matchesPlayed),
  };
}

export function toPlayerProfile(p: {
  id: string;
  displayName: string;
  rating: { toFixed(n: number): string };
  peakRating: { toFixed(n: number): string };
  matchesPlayed: number;
  wins: number;
  losses: number;
  active: boolean;
}) {
  const matches = p.matchesPlayed;
  return {
    ...toPlayerListItem(p),
    peakRating: ratingNumber(p.peakRating),
    wins: p.wins,
    losses: p.losses,
    winRate: matches > 0 ? p.wins / matches : null,
  };
}

function similarWarnings(
  candidates: readonly { id: string; displayName: string; normalizedName: string }[],
  normalizedName: string,
) {
  return candidates
    .filter((c) => levenshtein(c.normalizedName, normalizedName) <= SIMILAR_THRESHOLD)
    .filter((c) => c.normalizedName !== normalizedName)
    .map((c) => ({ id: c.id, displayName: c.displayName }));
}

export async function listPlayersPublic(prisma: PrismaClient) {
  const rows = await repo.listPlayers(prisma, true);
  return rows.map(toPlayerListItem);
}

export async function getPlayerProfile(prisma: PrismaClient, id: string) {
  const player = await repo.findPlayer(prisma, id);
  if (player === null || !player.active) {
    throw new AppError(ErrorCode.PLAYER_NOT_FOUND, 404, 'Player not found');
  }
  const rank = await rankForPlayer(prisma, player);
  return {
    ...toPlayerProfile(player),
    status: rankingStatus(player.matchesPlayed),
    rank,
  };
}

export async function createPlayer(
  prisma: PrismaClient,
  actor: Actor,
  body: CreatePlayerBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const normalizedName = normalizeDisplayName(body.displayName);
  const dup = await repo.findByNormalizedName(prisma, normalizedName);
  if (dup !== null) {
    throw new AppError(ErrorCode.PLAYER_DUPLICATE, 409, 'A player with this name already exists', {
      playerId: dup.id,
    });
  }
  const similar = similarWarnings(
    await repo.findSimilarNames(prisma, normalizedName),
    normalizedName,
  );
  const player = await repo.createPlayer(prisma, {
    displayName: body.displayName,
    normalizedName,
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'player.create',
    entityType: 'Player',
    entityId: player.id,
    after: { displayName: player.displayName },
    requestId: audit.requestId,
  });
  return {
    player: toPlayerListItem(player),
    ...(similar.length > 0
      ? { warnings: [{ kind: 'SIMILAR_NAME' as const, players: similar }] }
      : {}),
  };
}

export async function updatePlayer(
  prisma: PrismaClient,
  actor: Actor,
  id: string,
  body: UpdatePlayerBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const existing = await repo.findPlayer(prisma, id);
  if (existing === null) {
    throw new AppError(ErrorCode.PLAYER_NOT_FOUND, 404, 'Player not found');
  }
  const data: { displayName?: string; normalizedName?: string; active?: boolean } = {};
  if (body.displayName !== undefined) {
    const normalizedName = normalizeDisplayName(body.displayName);
    const dup = await repo.findByNormalizedName(prisma, normalizedName);
    if (dup !== null && dup.id !== id) {
      throw new AppError(ErrorCode.PLAYER_DUPLICATE, 409, 'A player with this name already exists');
    }
    data.displayName = body.displayName;
    data.normalizedName = normalizedName;
  }
  if (body.active !== undefined) data.active = body.active;
  const player = await repo.updatePlayer(prisma, id, data);
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'player.update',
    entityType: 'Player',
    entityId: id,
    before: { displayName: existing.displayName, active: existing.active },
    after: { displayName: player.displayName, active: player.active },
    requestId: audit.requestId,
  });
  return toPlayerListItem(player);
}

export async function listPlayersAdmin(prisma: PrismaClient, actor: Actor) {
  assertAdmin(actor);
  const rows = await repo.listPlayers(prisma, false);
  return rows.map(toPlayerListItem);
}
