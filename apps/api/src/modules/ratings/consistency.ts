import { foldLedger, INITIAL_RATING, NEW_PLAYER_STATE, type PlayerState } from '@pbl/elo-engine';
import type { PrismaClient } from '@pbl/database';
import { numberFromDecimal } from './decimal.js';
import { loadConfirmedMatchResults } from './load.js';

/**
 * Asserts active ledger ratings match a fresh fold over all confirmed results (test utility).
 */
export async function assertLedgerMatchesFold(prisma: PrismaClient): Promise<void> {
  const results = await loadConfirmedMatchResults(prisma);
  const initial = new Map<string, PlayerState>();
  const folded = foldLedger(initial, results);

  const players = await prisma.player.findMany({ select: { id: true, rating: true } });
  for (const player of players) {
    const fromFold = folded.state.get(player.id) ?? NEW_PLAYER_STATE;
    const projection = numberFromDecimal(player.rating);
    const lastTxn = await prisma.ratingTransaction.findFirst({
      where: { playerId: player.id, supersededByRunId: null },
      orderBy: { orderKey: 'desc' },
    });
    const fromLedger = lastTxn !== null ? numberFromDecimal(lastTxn.ratingAfter) : INITIAL_RATING;
    if (
      Math.abs(fromFold.rating - projection) > 0.0001 ||
      Math.abs(fromFold.rating - fromLedger) > 0.0001
    ) {
      throw new Error(
        `player ${player.id}: fold=${String(fromFold.rating)} projection=${String(projection)} ledger=${String(fromLedger)}`,
      );
    }
  }
}
