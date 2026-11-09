import { RANKED_MATCH_THRESHOLD } from '@pbl/elo-engine';
import type { PrismaClient } from '@pbl/database';
import {
  AppError,
  ErrorCode,
  type LeaderboardQuery,
  type MonthlyActivityQuery,
  type RatingHistoryQuery,
  type RecentMatchesQuery,
} from '@pbl/shared';
import { JAKARTA_TIMEZONE, jakartaMonthKey } from '../../lib/jakarta-month.js';
import { ratingNumber } from '../../lib/ranked.js';
import { assignCompetitionRanks, baseStats } from './serialize.js';

export async function listLeaderboard(prisma: PrismaClient, query: LeaderboardQuery) {
  const where =
    query.tab === 'ranked'
      ? { active: true, matchesPlayed: { gte: RANKED_MATCH_THRESHOLD } }
      : { active: true, matchesPlayed: { lt: RANKED_MATCH_THRESHOLD } };

  const total = await prisma.player.count({ where });
  const rows = await prisma.player.findMany({
    where,
    orderBy: [{ rating: 'desc' }, { displayName: 'asc' }],
    skip: query.offset,
    take: query.limit,
  });

  let entries = rows.map((p) => {
    const e = baseStats(p);
    return {
      id: e.id,
      displayName: e.displayName,
      rating: e.rating,
      matchesPlayed: e.matchesPlayed,
      active: e.active,
      status: e.status,
      rank: null as number | null,
      peakRating: e.peakRating,
      wins: e.wins,
      losses: e.losses,
      winRate: e.winRate,
    };
  });

  if (query.tab === 'ranked') {
    entries = assignCompetitionRanks(entries);
  }

  return {
    tab: query.tab,
    total,
    limit: query.limit,
    offset: query.offset,
    entries,
  };
}

export async function getRatingHistory(
  prisma: PrismaClient,
  playerId: string,
  query: RatingHistoryQuery,
) {
  await requireActivePlayer(prisma, playerId);
  const where = { playerId, supersededByRunId: null };
  const total = await prisma.ratingTransaction.count({ where });
  const rows = await prisma.ratingTransaction.findMany({
    where,
    orderBy: { orderKey: 'asc' },
    skip: query.offset,
    take: query.limit,
  });

  const points = rows.map((row) => ({
    matchId: row.matchId,
    orderKey: row.orderKey,
    at: row.createdAt.toISOString(),
    ratingAfter: ratingNumber(row.ratingAfter),
    delta: ratingNumber(row.delta),
    result: row.result === 1 ? (1 as const) : (0 as const),
  }));

  return { playerId, total, limit: query.limit, offset: query.offset, points };
}

export async function getRecentMatches(
  prisma: PrismaClient,
  playerId: string,
  query: RecentMatchesQuery,
) {
  await requireActivePlayer(prisma, playerId);
  const where = { playerId, supersededByRunId: null };
  const total = await prisma.ratingTransaction.count({ where });
  const rows = await prisma.ratingTransaction.findMany({
    where,
    orderBy: { orderKey: 'desc' },
    skip: query.offset,
    take: query.limit,
    include: {
      match: {
        include: {
          round: { include: { openPlay: { select: { id: true, title: true } } } },
        },
      },
    },
  });

  const matches = rows.map((row) => {
    const m = row.match;
    const playedAt = m.confirmedAt ?? row.createdAt;
    return {
      matchId: m.id,
      sessionId: m.round.openPlay.id,
      sessionTitle: m.round.openPlay.title,
      roundNumber: m.round.number,
      courtNumber: m.courtNumber,
      playedAt: playedAt.toISOString(),
      won: row.result === 1,
    };
  });

  return { playerId, total, limit: query.limit, offset: query.offset, matches };
}

export async function getMonthlyActivity(
  prisma: PrismaClient,
  playerId: string,
  query: MonthlyActivityQuery,
) {
  await requireActivePlayer(prisma, playerId);
  const rows = await prisma.ratingTransaction.findMany({
    where: { playerId, supersededByRunId: null },
    include: { match: { select: { confirmedAt: true } } },
    orderBy: { orderKey: 'asc' },
  });

  const buckets = new Map<string, { matchesPlayed: number; wins: number }>();
  for (const row of rows) {
    const when = row.match.confirmedAt ?? row.createdAt;
    const key = jakartaMonthKey(when);
    const cur = buckets.get(key) ?? { matchesPlayed: 0, wins: 0 };
    cur.matchesPlayed += 1;
    if (row.result === 1) cur.wins += 1;
    buckets.set(key, cur);
  }

  const sorted = [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, query.months)
    .map(([month, stats]) => ({ month, ...stats }));

  return { playerId, timezone: JAKARTA_TIMEZONE, months: sorted };
}

async function requireActivePlayer(prisma: PrismaClient, playerId: string): Promise<void> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (player === null || !player.active) {
    throw new AppError(ErrorCode.PLAYER_NOT_FOUND, 404, 'Player not found');
  }
}
