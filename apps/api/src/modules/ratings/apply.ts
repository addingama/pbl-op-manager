import {
  ENGINE_VERSION,
  matchDeltas,
  matchPlayers,
  type MatchRatingChange,
  type MatchResult,
} from '@pbl/elo-engine';
import type { RatingRunKind } from '@pbl/database';
import type { TransactionClient } from '../../lib/transaction-client.js';
import { acquireEloAdvisoryLock } from '../../lib/elo-lock.js';
import { decimalFromNumber, decimalString } from './decimal.js';
import { canIncrementalConfirm, foldConfirmedFrom, ratingsSnapshotFromPlayers } from './load.js';
import { rebuildPlayerProjections } from './projections.js';

export interface ApplyRatingOptions {
  readonly adminId: string;
  readonly reason: string;
  readonly triggerMatchId: string | null;
  readonly runKind: RatingRunKind;
}

async function insertMatchTransactions(
  tx: TransactionClient,
  runId: string,
  orderKey: string,
  change: MatchRatingChange,
): Promise<void> {
  for (const c of change.changes) {
    await tx.ratingTransaction.create({
      data: {
        playerId: c.playerId,
        matchId: change.matchId,
        orderKey,
        team: c.team,
        result: c.result,
        ratingBefore: decimalFromNumber(c.ratingBefore),
        teamRating: decimalFromNumber(c.teamRating),
        opponentRating: decimalFromNumber(c.opponentRating),
        expected: decimalFromNumber(c.expected),
        delta: decimalFromNumber(c.delta),
        ratingAfter: decimalFromNumber(c.ratingAfter),
        runId,
      },
    });
  }
}

export async function replayFromOrderKey(
  tx: TransactionClient,
  fromOrderKey: string,
  options: ApplyRatingOptions,
): Promise<readonly MatchRatingChange[]> {
  await acquireEloAdvisoryLock(tx);
  const { folded, ordered } = await foldConfirmedFrom(tx, fromOrderKey);

  const run = await tx.ratingRun.create({
    data: {
      kind: 'REPLAY',
      reason: options.reason,
      triggerMatch: options.triggerMatchId,
      fromOrderKey,
      engineVersion: `elo-engine@${ENGINE_VERSION}`,
      createdById: options.adminId,
    },
  });

  const supersededPlayers = await tx.ratingTransaction.findMany({
    where: { supersededByRunId: null, orderKey: { gte: fromOrderKey } },
    select: { playerId: true },
    distinct: ['playerId'],
  });

  await tx.ratingTransaction.updateMany({
    where: { supersededByRunId: null, orderKey: { gte: fromOrderKey } },
    data: { supersededByRunId: run.id },
  });

  const matchIds = new Set(ordered.map((m) => m.matchId));
  const orderKeys = await tx.match.findMany({
    where: { id: { in: [...matchIds] } },
    select: { id: true, orderKey: true },
  });
  const orderKeyByMatch = new Map(orderKeys.map((m) => [m.id, m.orderKey]));

  for (const change of folded.history) {
    const key = orderKeyByMatch.get(change.matchId);
    if (key === undefined) throw new Error(`missing order key for ${change.matchId}`);
    await insertMatchTransactions(tx, run.id, key, change);
  }

  const players = new Set<string>(supersededPlayers.map((p) => p.playerId));
  for (const change of folded.history) {
    for (const c of change.changes) players.add(c.playerId);
  }
  await rebuildPlayerProjections(tx, [...players]);

  return folded.history;
}

export async function incrementalConfirmMatch(
  tx: TransactionClient,
  match: MatchResult,
  orderKey: string,
  options: ApplyRatingOptions,
): Promise<MatchRatingChange> {
  await acquireEloAdvisoryLock(tx);
  const playerIds = matchPlayers(match);
  const players = await tx.player.findMany({
    where: { id: { in: [...playerIds] } },
    select: { id: true, rating: true },
  });
  const ratings = ratingsSnapshotFromPlayers(players);
  const change = matchDeltas(match, ratings);

  const run = await tx.ratingRun.create({
    data: {
      kind: 'INCREMENTAL',
      reason: options.reason,
      triggerMatch: options.triggerMatchId,
      fromOrderKey: null,
      engineVersion: `elo-engine@${ENGINE_VERSION}`,
      createdById: options.adminId,
    },
  });

  await insertMatchTransactions(tx, run.id, orderKey, change);
  await rebuildPlayerProjections(tx, playerIds);
  return change;
}

export async function applyConfirmedMatchRatings(
  tx: TransactionClient,
  match: MatchResult,
  orderKey: string,
  options: ApplyRatingOptions,
): Promise<readonly MatchRatingChange[]> {
  const playerIds = matchPlayers(match);
  if (options.runKind === 'INCREMENTAL' && (await canIncrementalConfirm(tx, orderKey, playerIds))) {
    const change = await incrementalConfirmMatch(tx, match, orderKey, options);
    return [change];
  }
  return replayFromOrderKey(tx, orderKey, options);
}

export function serializeRatingChanges(change: MatchRatingChange) {
  return change.changes.map((c) => ({
    playerId: c.playerId,
    team: c.team,
    result: c.result,
    ratingBefore: decimalString(c.ratingBefore),
    ratingAfter: decimalString(c.ratingAfter),
    delta: decimalString(c.delta),
  }));
}
