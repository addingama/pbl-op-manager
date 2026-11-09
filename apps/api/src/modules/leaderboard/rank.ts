import { RANKED_MATCH_THRESHOLD } from '@pbl/elo-engine';
import type { Player, PrismaClient } from '@pbl/database';

export async function rankForPlayer(
  prisma: PrismaClient,
  player: Pick<Player, 'id' | 'matchesPlayed' | 'rating'>,
): Promise<number | null> {
  if (player.matchesPlayed < RANKED_MATCH_THRESHOLD) return null;
  const ahead = await prisma.player.count({
    where: {
      active: true,
      matchesPlayed: { gte: RANKED_MATCH_THRESHOLD },
      OR: [
        { rating: { gt: player.rating } },
        { AND: [{ rating: { equals: player.rating } }, { id: { lt: player.id } }] },
      ],
    },
  });
  return ahead + 1;
}
