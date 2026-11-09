import { matchOrderKey, type Prisma } from '@pbl/database';
import type { GeneratedMatch, GeneratorMode } from '@pbl/match-generator';
import { GENERATOR_VERSION } from '@pbl/match-generator';
import { validateRound } from '@pbl/match-generator';

import type { TransactionClient } from '../../lib/transaction-client.js';

export interface PersistRoundInput {
  readonly openPlayId: string;
  readonly sessionStartsAt: Date;
  readonly number: number;
  readonly mode: GeneratorMode | 'MANUAL';
  readonly settings: Record<string, unknown>;
  readonly seed: string | null;
  readonly ratingSnapshot: Record<string, number>;
  readonly matches: readonly GeneratedMatch[];
  readonly resting: readonly string[];
  readonly createdById: string;
  readonly courts: number;
  readonly eligibleIds: readonly string[];
}

export async function persistRound(
  tx: TransactionClient,
  input: PersistRoundInput,
): Promise<string> {
  const violations = validateRound(input.matches, input.courts, [...input.eligibleIds]);
  if (violations.length > 0) {
    throw new Error(`round validation failed: ${violations.map((v) => v.kind).join(',')}`);
  }

  const round = await tx.round.create({
    data: {
      openPlayId: input.openPlayId,
      number: input.number,
      mode: input.mode,
      settings: input.settings as Prisma.InputJsonValue,
      seed: input.seed,
      generatorVersion: input.mode === 'MANUAL' ? null : `match-generator@${GENERATOR_VERSION}`,
      ratingSnapshot: input.ratingSnapshot,
      createdById: input.createdById,
    },
  });

  const playing = new Set<string>();
  for (const match of input.matches) {
    const orderKey = matchOrderKey(
      input.sessionStartsAt,
      input.openPlayId,
      input.number,
      match.court,
    );
    const row = await tx.match.create({
      data: {
        roundId: round.id,
        courtNumber: match.court,
        orderKey,
      },
    });
    await tx.roundAssignment.createMany({
      data: [match.team1, match.team2].flatMap((team, t) =>
        team.map((playerId, p) => {
          playing.add(playerId);
          return {
            roundId: round.id,
            playerId,
            status: 'PLAYING' as const,
            matchId: row.id,
            team: t + 1,
            position: p + 1,
          };
        }),
      ),
    });
  }

  const rest =
    input.resting.length > 0
      ? input.resting
      : [...input.eligibleIds].filter((id) => !playing.has(id));
  if (rest.length > 0) {
    await tx.roundAssignment.createMany({
      data: rest.map((playerId) => ({
        roundId: round.id,
        playerId,
        status: 'RESTING' as const,
      })),
    });
  }

  return round.id;
}
