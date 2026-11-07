import { generateRound } from './generate.js';
import { Random } from './random.js';
import type {
  GeneratedRound,
  GeneratorMode,
  GeneratorSettings,
  Participant,
  PlayerId,
  PreviousRound,
  Team,
} from './types.js';

/** Players p01..pNN with ratings spread around 1000 (deterministic). */
export function makePlayers(count: number, spread = 400): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    rating: count <= 1 ? 1000 : Math.round(1000 - spread / 2 + (spread * i) / (count - 1)),
  }));
}

/** Pairs consecutive players into fixed teams. */
export function pairUp(players: readonly Participant[]): Team[] {
  const teams: Team[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    teams.push([(players[i] as Participant).id, (players[i + 1] as Participant).id]);
  }
  return teams;
}

export interface SimulationOptions {
  readonly mode: GeneratorMode;
  readonly players: readonly Participant[];
  readonly courts: number;
  readonly rounds: number;
  readonly seed: string;
  readonly fixedTeams?: readonly Team[];
  readonly settings?: Partial<GeneratorSettings>;
  /** Round number (1-based) at which a player becomes available; default 1. */
  readonly joinRound?: ReadonlyMap<PlayerId, number>;
}

/** Runs a whole session, feeding each round back as history with seeded random winners. */
export function simulateSession(options: SimulationOptions): {
  rounds: GeneratedRound[];
  previousRounds: PreviousRound[];
} {
  const winners = new Random(`${options.seed}:winners`);
  const previousRounds: PreviousRound[] = [];
  const rounds: GeneratedRound[] = [];

  for (let roundNumber = 1; roundNumber <= options.rounds; roundNumber++) {
    const participants = options.players.filter(
      (p) => (options.joinRound?.get(p.id) ?? 1) <= roundNumber,
    );
    const round = generateRound({
      mode: options.mode,
      courts: options.courts,
      seed: `${options.seed}:r${String(roundNumber)}`,
      participants,
      previousRounds,
      ...(options.fixedTeams === undefined ? {} : { fixedTeams: options.fixedTeams }),
      ...(options.settings === undefined ? {} : { settings: options.settings }),
    });
    rounds.push(round);
    previousRounds.push({
      roundNumber,
      matches: round.matches.map((m) => ({
        team1: m.team1,
        team2: m.team2,
        winner: winners.next() < 0.5 ? 1 : 2,
      })),
    });
  }
  return { rounds, previousRounds };
}

/** Index access that fails loudly instead of yielding undefined. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${String(index)}`);
  return item;
}

export function playingIds(round: GeneratedRound): PlayerId[] {
  return round.matches.flatMap((m) => [...m.team1, ...m.team2]);
}

export function partnerCounts(rounds: readonly GeneratedRound[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const m of round.matches) {
      for (const team of [m.team1, m.team2]) {
        const key = [...team].sort().join('+');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}
