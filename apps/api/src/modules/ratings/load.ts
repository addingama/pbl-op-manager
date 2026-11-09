import {
  ENGINE_VERSION,
  INITIAL_RATING,
  NEW_PLAYER_STATE,
  foldLedger,
  type LedgerState,
  type MatchResult,
  type PlayerState,
} from '@pbl/elo-engine';
import type { TransactionClient } from '../../lib/transaction-client.js';
import { numberFromDecimal } from './decimal.js';
import { buildMatchResult } from './match-result.js';

export async function loadConfirmedMatchResults(tx: TransactionClient): Promise<MatchResult[]> {
  const matches = await tx.match.findMany({
    where: {
      status: 'COMPLETED',
      winnerTeam: { not: null },
      cancelledAt: null,
    },
    orderBy: { orderKey: 'asc' },
    include: {
      assignments: {
        where: { status: 'PLAYING' },
        orderBy: [{ team: 'asc' }, { position: 'asc' }],
      },
    },
  });

  return matches.map((m) => {
    if (m.winnerTeam !== 1 && m.winnerTeam !== 2) {
      throw new Error(`match ${m.id} missing winner`);
    }
    return buildMatchResult(m.id, m.winnerTeam, m.assignments);
  });
}

async function initialLedgerStateBefore(
  tx: TransactionClient,
  beforeOrderKey: string,
): Promise<LedgerState> {
  const txns = await tx.ratingTransaction.findMany({
    where: { supersededByRunId: null, orderKey: { lt: beforeOrderKey } },
    orderBy: { orderKey: 'asc' },
  });

  const byPlayer = new Map<string, PlayerState>();
  const counters = new Map<
    string,
    { matchesPlayed: number; wins: number; losses: number; peak: number }
  >();

  for (const row of txns) {
    const ratingAfter = numberFromDecimal(row.ratingAfter);
    const prev = counters.get(row.playerId) ?? {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      peak: INITIAL_RATING,
    };
    prev.matchesPlayed += 1;
    if (row.result === 1) prev.wins += 1;
    else prev.losses += 1;
    prev.peak = Math.max(prev.peak, ratingAfter);
    counters.set(row.playerId, prev);
    byPlayer.set(row.playerId, {
      rating: ratingAfter,
      peakRating: prev.peak,
      matchesPlayed: prev.matchesPlayed,
      wins: prev.wins,
      losses: prev.losses,
    });
  }

  return byPlayer;
}

export async function loadConfirmedMatchResultsFrom(
  tx: TransactionClient,
  fromOrderKey: string,
): Promise<MatchResult[]> {
  const matches = await tx.match.findMany({
    where: {
      status: 'COMPLETED',
      winnerTeam: { not: null },
      cancelledAt: null,
      orderKey: { gte: fromOrderKey },
    },
    orderBy: { orderKey: 'asc' },
    include: {
      assignments: {
        where: { status: 'PLAYING' },
        orderBy: [{ team: 'asc' }, { position: 'asc' }],
      },
    },
  });

  return matches.map((m) => {
    if (m.winnerTeam !== 1 && m.winnerTeam !== 2) {
      throw new Error(`match ${m.id} missing winner`);
    }
    return buildMatchResult(m.id, m.winnerTeam, m.assignments);
  });
}

export async function foldConfirmedFrom(
  tx: TransactionClient,
  fromOrderKey: string,
): Promise<{ ordered: MatchResult[]; folded: ReturnType<typeof foldLedger> }> {
  const ordered = await loadConfirmedMatchResultsFrom(tx, fromOrderKey);
  const initial = await initialLedgerStateBefore(tx, fromOrderKey);
  const folded = foldLedger(initial, ordered);
  return { ordered, folded };
}

export async function canIncrementalConfirm(
  tx: TransactionClient,
  orderKey: string,
  playerIds: readonly string[],
): Promise<boolean> {
  for (const playerId of playerIds) {
    const latest = await tx.ratingTransaction.findFirst({
      where: { playerId, supersededByRunId: null },
      orderBy: { orderKey: 'desc' },
    });
    if (latest !== null && orderKey <= latest.orderKey) return false;
  }
  return true;
}

export function ratingsSnapshotFromPlayers(
  players: readonly { id: string; rating: { toFixed(n: number): string } }[],
): Map<string, number> {
  return new Map(players.map((p) => [p.id, numberFromDecimal(p.rating)]));
}

export { ENGINE_VERSION, INITIAL_RATING, NEW_PLAYER_STATE };
