import {
  ENGINE_VERSION,
  expectedScore,
  foldLedger,
  NEW_PLAYER_STATE,
  type LedgerState,
  type MatchRatingChange,
} from '@pbl/elo-engine';
import { GENERATOR_VERSION, generateRound, Random, type PreviousRound } from '@pbl/match-generator';
import { hash } from 'argon2';
import { truncateAllTables } from './client.js';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';
import { matchOrderKey } from './order-key.js';

export const SEED_PLAYER_NAMES = [
  'Adi Saputra',
  'Bella Kusuma',
  'Citra Lestari',
  'Dimas Pratama',
  'Eka Wijaya',
  'Fajar Nugroho',
  'Gita Permata',
  'Hendra Gunawan',
  'Indah Sari',
  'Joko Santoso',
  'Kevin Halim',
  'Lina Marlina',
  'Made Wirawan',
  'Nadia Putri',
  'Oscar Tanoto',
  'Putu Ayu',
  'Rizky Ramadhan',
  'Sinta Dewi',
  'Taufik Hidayat',
  'Wulan Anggraini',
] as const;

export const SEED_COMPLETED_SESSION = {
  title: 'PBL Open Play — Sunday Night',
  startsAt: new Date('2026-11-01T12:00:00.000Z'),
  courts: 4,
  rounds: 8,
  seed: 'pbl-dev-seed',
} as const;

export const SEED_DRAFT_SESSION = {
  title: 'PBL Open Play — Next Sunday',
  startsAt: new Date('2026-11-15T12:00:00.000Z'),
  courts: 2,
  capacity: 16,
  registered: 8,
} as const;

export interface SeedAdmin {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
}

export interface SeedSummary {
  readonly adminId: string;
  readonly players: number;
  readonly sessions: number;
  readonly rounds: number;
  readonly matches: number;
  readonly ratingTransactions: number;
}

/**
 * Wipes the database and loads deterministic dev data (docs/DATABASE.md §9). Matches come
 * from the match generator, results from a seeded draw weighted by hidden skill, and the
 * rating ledger from the Elo engine — never hand-written ratings. Dev/test only.
 */
export async function seedDevData(prisma: PrismaClient, admin: SeedAdmin): Promise<SeedSummary> {
  const passwordHash = await hash(admin.password, { type: 2 });
  await truncateAllTables(prisma);

  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          email: admin.email.trim().toLowerCase(),
          displayName: admin.displayName ?? 'Dev Admin',
          passwordHash,
        },
      });

      const players = [];
      for (const displayName of SEED_PLAYER_NAMES) {
        players.push(
          await tx.player.create({
            data: { displayName, normalizedName: displayName.toLowerCase() },
          }),
        );
      }
      const playerIds = players.map((p) => p.id);
      const skill = hiddenSkill(playerIds);

      const session = await tx.openPlay.create({
        data: {
          title: SEED_COMPLETED_SESSION.title,
          startsAt: SEED_COMPLETED_SESSION.startsAt,
          venue: 'PBL',
          courtCount: SEED_COMPLETED_SESSION.courts,
          status: 'COMPLETED',
          defaultMode: 'BALANCED_ELO',
          createdById: user.id,
          participants: {
            create: playerIds.map((playerId) => ({ playerId, status: 'ACTIVE', source: 'ADMIN' })),
          },
        },
      });
      const run = await tx.ratingRun.create({
        data: {
          kind: 'INCREMENTAL',
          reason: 'seed',
          engineVersion: `elo-engine@${ENGINE_VERSION}`,
          createdById: user.id,
        },
      });

      const winners = new Random(`${SEED_COMPLETED_SESSION.seed}:winners`);
      let ledger: LedgerState = new Map();
      const previousRounds: PreviousRound[] = [];
      let matchCount = 0;
      let txnCount = 0;

      for (let number = 1; number <= SEED_COMPLETED_SESSION.rounds; number++) {
        const ratingOf = (id: string): number => (ledger.get(id) ?? NEW_PLAYER_STATE).rating;
        const generated = generateRound({
          mode: 'BALANCED_ELO',
          courts: SEED_COMPLETED_SESSION.courts,
          seed: `${SEED_COMPLETED_SESSION.seed}:r${String(number)}`,
          participants: playerIds.map((id) => ({ id, rating: ratingOf(id) })),
          previousRounds,
        });

        const results = generated.matches.map((m) => {
          const team1Skill = (skillOf(skill, m.team1[0]) + skillOf(skill, m.team1[1])) / 2;
          const team2Skill = (skillOf(skill, m.team2[0]) + skillOf(skill, m.team2[1])) / 2;
          const winner: 1 | 2 = winners.next() < expectedScore(team1Skill, team2Skill) ? 1 : 2;
          return { ...m, winner, matchId: `r${String(number)}c${String(m.court)}` };
        });
        const folded = foldLedger(ledger, results);

        const round = await tx.round.create({
          data: {
            openPlayId: session.id,
            number,
            mode: generated.mode,
            settings: { ...generated.settings },
            seed: generated.seed,
            generatorVersion: `match-generator@${GENERATOR_VERSION}`,
            ratingSnapshot: Object.fromEntries(playerIds.map((id) => [id, ratingOf(id)])),
            createdById: user.id,
          },
        });

        for (const [index, result] of results.entries()) {
          const change = folded.history[index];
          if (change === undefined) throw new Error('fold history out of sync');
          const orderKey = matchOrderKey(session.startsAt, session.id, number, result.court);
          const match = await tx.match.create({
            data: {
              roundId: round.id,
              courtNumber: result.court,
              status: 'COMPLETED',
              winnerTeam: result.winner,
              confirmedById: user.id,
              confirmedAt: SEED_COMPLETED_SESSION.startsAt,
              startedAt: SEED_COMPLETED_SESSION.startsAt,
              orderKey,
            },
          });
          await tx.roundAssignment.createMany({
            data: [result.team1, result.team2].flatMap((team, t) =>
              team.map((playerId, p) => ({
                roundId: round.id,
                playerId,
                status: 'PLAYING' as const,
                matchId: match.id,
                team: t + 1,
                position: p + 1,
              })),
            ),
          });
          await tx.ratingTransaction.createMany({
            data: ledgerRows(change, match.id, orderKey, run.id),
          });
          matchCount++;
          txnCount += change.changes.length;
        }
        await tx.roundAssignment.createMany({
          data: generated.resting.map((playerId) => ({
            roundId: round.id,
            playerId,
            status: 'RESTING' as const,
          })),
        });

        ledger = folded.state;
        previousRounds.push({ roundNumber: number, matches: results });
      }

      for (const [playerId, state] of ledger) {
        await tx.player.update({
          where: { id: playerId },
          data: {
            rating: decimal(state.rating, 4),
            peakRating: decimal(state.peakRating, 4),
            matchesPlayed: state.matchesPlayed,
            wins: state.wins,
            losses: state.losses,
          },
        });
      }

      await tx.openPlay.create({
        data: {
          title: SEED_DRAFT_SESSION.title,
          startsAt: SEED_DRAFT_SESSION.startsAt,
          venue: 'PBL',
          courtCount: SEED_DRAFT_SESSION.courts,
          capacity: SEED_DRAFT_SESSION.capacity,
          status: 'DRAFT',
          createdById: user.id,
          participants: {
            create: playerIds.slice(0, SEED_DRAFT_SESSION.registered).map((playerId) => ({
              playerId,
              status: 'REGISTERED',
              source: 'ADMIN',
            })),
          },
        },
      });

      return {
        adminId: user.id,
        players: players.length,
        sessions: 2,
        rounds: SEED_COMPLETED_SESSION.rounds,
        matches: matchCount,
        ratingTransactions: txnCount,
      };
    },
    { timeout: 60_000 },
  );
}

/** Evenly spread "true" strength (850..1150) so seeded results produce varied ratings. */
function hiddenSkill(playerIds: readonly string[]): ReadonlyMap<string, number> {
  const step = 300 / Math.max(1, playerIds.length - 1);
  return new Map(playerIds.map((id, i) => [id, 1150 - i * step]));
}

function skillOf(skill: ReadonlyMap<string, number>, playerId: string): number {
  const value = skill.get(playerId);
  if (value === undefined) throw new Error(`no hidden skill for ${playerId}`);
  return value;
}

function ledgerRows(
  change: MatchRatingChange,
  matchId: string,
  orderKey: string,
  runId: string,
): Prisma.RatingTransactionCreateManyInput[] {
  return change.changes.map((c) => ({
    playerId: c.playerId,
    matchId,
    orderKey,
    team: c.team,
    result: c.result,
    ratingBefore: decimal(c.ratingBefore, 4),
    teamRating: decimal(c.teamRating, 4),
    opponentRating: decimal(c.opponentRating, 4),
    expected: decimal(c.expected, 6),
    delta: decimal(c.delta, 4),
    ratingAfter: decimal(c.ratingAfter, 4),
    runId,
  }));
}

function decimal(value: number, places: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(places));
}
