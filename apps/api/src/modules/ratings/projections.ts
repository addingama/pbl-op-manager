import { INITIAL_RATING } from '@pbl/elo-engine';
import type { TransactionClient } from '../../lib/transaction-client.js';
import { decimalFromNumber, numberFromDecimal } from './decimal.js';

export async function rebuildPlayerProjections(
  tx: TransactionClient,
  playerIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(playerIds)];
  for (const playerId of unique) {
    const txns = await tx.ratingTransaction.findMany({
      where: { playerId, supersededByRunId: null },
      orderBy: { orderKey: 'asc' },
    });
    if (txns.length === 0) {
      await tx.player.update({
        where: { id: playerId },
        data: {
          rating: decimalFromNumber(INITIAL_RATING),
          peakRating: decimalFromNumber(INITIAL_RATING),
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
        },
      });
      continue;
    }
    let peak = INITIAL_RATING;
    let wins = 0;
    let losses = 0;
    for (const row of txns) {
      const after = numberFromDecimal(row.ratingAfter);
      peak = Math.max(peak, after);
      if (row.result === 1) wins += 1;
      else losses += 1;
    }
    const last = txns[txns.length - 1];
    if (last === undefined) continue;
    await tx.player.update({
      where: { id: playerId },
      data: {
        rating: last.ratingAfter,
        peakRating: decimalFromNumber(peak),
        matchesPlayed: wins + losses,
        wins,
        losses,
      },
    });
  }
}

export async function rebuildAllPlayersInLedger(tx: TransactionClient): Promise<void> {
  const rows = await tx.ratingTransaction.findMany({
    where: { supersededByRunId: null },
    distinct: ['playerId'],
    select: { playerId: true },
  });
  await rebuildPlayerProjections(
    tx,
    rows.map((r) => r.playerId),
  );
}
