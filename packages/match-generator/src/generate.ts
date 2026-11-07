import { DEFAULT_SETTINGS, GENERATOR_VERSION, PLAYERS_PER_MATCH } from './constants.js';
import { MatchGeneratorError } from './errors.js';
import { buildSessionHistory, type SessionHistory } from './history.js';
import { optimizeArrangement } from './optimize.js';
import { Random } from './random.js';
import { selectByFairness } from './selection.js';
import type {
  GeneratedMatch,
  GeneratedRound,
  GenerateRoundInput,
  GeneratorSettings,
  MatchDiagnostics,
  PlayerId,
  Team,
} from './types.js';

const MAX_RESTARTS = 1000;

type Ratings = ReadonlyMap<PlayerId, number>;

/**
 * Generates one round. Pure and deterministic: the same input (regardless of
 * participant / team order) and seed always produce the same round.
 */
export function generateRound(input: GenerateRoundInput): GeneratedRound {
  const settings = resolveSettings(input);
  validateInput(input);

  const participants = [...input.participants].sort((a, b) => compareIds(a.id, b.id));
  const ratings: Ratings = new Map(participants.map((p) => [p.id, p.rating]));
  const history = buildSessionHistory(input.previousRounds);
  const random = new Random(input.seed);

  const teams =
    input.mode === 'FIXED_PARTNER'
      ? arrangeFixedPartners(input, ratings, history, settings, random)
      : arrangePlayers(
          input,
          participants.map((p) => p.id),
          ratings,
          history,
          settings,
          random,
        );

  const matches: GeneratedMatch[] = teams.map(([team1, team2], i) => ({
    court: i + 1,
    team1,
    team2,
  }));
  const playing = new Set(matches.flatMap((m) => [...m.team1, ...m.team2]));
  const resting = participants.map((p) => p.id).filter((id) => !playing.has(id));

  return {
    generatorVersion: GENERATOR_VERSION,
    mode: input.mode,
    seed: input.seed,
    settings,
    matches,
    resting,
    diagnostics: diagnose(matches, ratings, history),
  };
}

function arrangePlayers(
  input: GenerateRoundInput,
  playerIds: readonly PlayerId[],
  ratings: Ratings,
  history: SessionHistory,
  settings: GeneratorSettings,
  random: Random,
): [Team, Team][] {
  const matchCount = Math.min(input.courts, Math.floor(playerIds.length / PLAYERS_PER_MATCH));
  const { selected } = selectByFairness(
    playerIds,
    matchCount * PLAYERS_PER_MATCH,
    (id) => history.statsOf(id),
    random,
  );
  if (matchCount === 0) return [];

  if (input.mode === 'MEXICANO' && history.hasResults) {
    return mexicanoGroups(selected, ratings, history, random);
  }

  const arrangement = optimizeArrangement(
    selected,
    PLAYERS_PER_MATCH,
    (group) => playerGroupCost(group, ratings, history, settings),
    random,
    settings.restarts,
  );
  return quads(arrangement).map(([a, b, c, d]) => [
    [a, b],
    [c, d],
  ]);
}

/** Mexicano rounds after results exist: rank, group consecutive 4s, 1st+4th vs 2nd+3rd. */
function mexicanoGroups(
  selected: readonly PlayerId[],
  ratings: Ratings,
  history: SessionHistory,
  random: Random,
): [Team, Team][] {
  const ranked = selected
    .map((id) => {
      const stats = history.statsOf(id);
      return {
        id,
        wins: stats.wins,
        winRate: stats.gamesPlayed === 0 ? 0 : stats.wins / stats.gamesPlayed,
        rating: ratings.get(id) ?? 0,
        tiebreak: random.next(),
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins || b.winRate - a.winRate || b.rating - a.rating || a.tiebreak - b.tiebreak,
    )
    .map((p) => p.id);

  return quads(ranked).map(([first, second, third, fourth]) => [
    [first, fourth],
    [second, third],
  ]);
}

function arrangeFixedPartners(
  input: GenerateRoundInput,
  ratings: Ratings,
  history: SessionHistory,
  settings: GeneratorSettings,
  random: Random,
): [Team, Team][] {
  const present = new Set(ratings.keys());
  const teams = (input.fixedTeams ?? [])
    .map((team): Team =>
      compareIds(team[0], team[1]) <= 0 ? [team[0], team[1]] : [team[1], team[0]],
    )
    .filter(([a, b]) => present.has(a) && present.has(b))
    .sort((x, y) => compareIds(x[0], y[0]));

  const matchCount = Math.min(input.courts, Math.floor(teams.length / 2));
  const { selected } = selectByFairness(
    teams,
    matchCount * 2,
    ([a, b]) => {
      const sa = history.statsOf(a);
      const sb = history.statsOf(b);
      return {
        gamesPlayed: Math.max(sa.gamesPlayed, sb.gamesPlayed),
        wins: 0,
        lastPlayedRound: maxNullable(sa.lastPlayedRound, sb.lastPlayedRound),
      };
    },
    random,
  );
  if (matchCount === 0) return [];

  const arrangement = optimizeArrangement(
    selected,
    2,
    ([t1, t2]) => teamPairCost(t1 as Team, t2 as Team, ratings, history, settings),
    random,
    settings.restarts,
  );
  return pairs(arrangement);
}

function playerGroupCost(
  group: readonly PlayerId[],
  ratings: Ratings,
  history: SessionHistory,
  settings: GeneratorSettings,
): number {
  const [a, b, c, d] = group as [PlayerId, PlayerId, PlayerId, PlayerId];
  const partners = history.partnerCount(a, b) + history.partnerCount(c, d);
  const opponents =
    history.opponentCount(a, c) +
    history.opponentCount(a, d) +
    history.opponentCount(b, c) +
    history.opponentCount(b, d);
  const diff = Math.abs(teamRating([a, b], ratings) - teamRating([c, d], ratings));
  return (
    settings.repeatPartnerWeight * partners +
    settings.repeatOpponentWeight * opponents +
    settings.ratingDiffWeight * diff
  );
}

function teamPairCost(
  t1: Team,
  t2: Team,
  ratings: Ratings,
  history: SessionHistory,
  settings: GeneratorSettings,
): number {
  const diff = Math.abs(teamRating(t1, ratings) - teamRating(t2, ratings));
  return (
    settings.repeatOpponentWeight * history.teamOpponentCount(t1, t2) +
    settings.ratingDiffWeight * diff
  );
}

function diagnose(
  matches: readonly GeneratedMatch[],
  ratings: Ratings,
  history: SessionHistory,
): GeneratedRound['diagnostics'] {
  const perMatch: MatchDiagnostics[] = matches.map(({ court, team1, team2 }) => {
    let repeatedOpponents = 0;
    for (const a of team1)
      for (const b of team2) if (history.opponentCount(a, b) > 0) repeatedOpponents++;
    return {
      court,
      teamRatingDiff: Math.abs(teamRating(team1, ratings) - teamRating(team2, ratings)),
      repeatedPartners:
        (history.partnerCount(...team1) > 0 ? 1 : 0) + (history.partnerCount(...team2) > 0 ? 1 : 0),
      repeatedOpponents,
    };
  });
  return {
    matches: perMatch,
    totalTeamRatingDiff: perMatch.reduce((sum, m) => sum + m.teamRatingDiff, 0),
    totalRepeatedPartners: perMatch.reduce((sum, m) => sum + m.repeatedPartners, 0),
    totalRepeatedOpponents: perMatch.reduce((sum, m) => sum + m.repeatedOpponents, 0),
  };
}

function resolveSettings(input: GenerateRoundInput): GeneratorSettings {
  const settings = { ...DEFAULT_SETTINGS[input.mode], ...input.settings };
  const weights = [
    settings.repeatPartnerWeight,
    settings.repeatOpponentWeight,
    settings.ratingDiffWeight,
  ];
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MatchGeneratorError('INVALID_SETTINGS', 'weights must be finite and non-negative');
  }
  if (
    !Number.isInteger(settings.restarts) ||
    settings.restarts < 1 ||
    settings.restarts > MAX_RESTARTS
  ) {
    throw new MatchGeneratorError(
      'INVALID_SETTINGS',
      `restarts must be an integer in 1..${String(MAX_RESTARTS)}`,
    );
  }
  return settings;
}

function validateInput(input: GenerateRoundInput): void {
  if (!Number.isInteger(input.courts) || input.courts < 1) {
    throw new MatchGeneratorError('INVALID_COURTS', 'courts must be an integer ≥ 1');
  }
  if (input.seed.length === 0) {
    throw new MatchGeneratorError('INVALID_SEED', 'seed must be a non-empty string');
  }
  const ids = new Set<PlayerId>();
  for (const p of input.participants) {
    if (ids.has(p.id))
      throw new MatchGeneratorError('DUPLICATE_PARTICIPANT', `duplicate participant ${p.id}`);
    if (!Number.isFinite(p.rating)) {
      throw new MatchGeneratorError(
        'INVALID_RATING',
        `participant ${p.id} has a non-finite rating`,
      );
    }
    ids.add(p.id);
  }
  if (input.mode === 'FIXED_PARTNER') {
    if (input.fixedTeams === undefined) {
      throw new MatchGeneratorError('INVALID_FIXED_TEAMS', 'FIXED_PARTNER requires fixedTeams');
    }
    const paired = new Set<PlayerId>();
    for (const team of input.fixedTeams) {
      for (const id of team) {
        if (paired.has(id)) {
          throw new MatchGeneratorError(
            'INVALID_FIXED_TEAMS',
            `player ${id} is in more than one team slot`,
          );
        }
        paired.add(id);
      }
    }
  }
}

function teamRating(team: Team, ratings: Ratings): number {
  return ((ratings.get(team[0]) ?? 0) + (ratings.get(team[1]) ?? 0)) / 2;
}

/** Consecutive groups of 4; any trailing remainder is dropped. */
function quads<T>(items: readonly T[]): [T, T, T, T][] {
  const out: [T, T, T, T][] = [];
  for (let i = 0; i + 4 <= items.length; i += 4) {
    out.push([items[i], items[i + 1], items[i + 2], items[i + 3]] as [T, T, T, T]);
  }
  return out;
}

/** Consecutive groups of 2; any trailing remainder is dropped. */
function pairs<T>(items: readonly T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i + 2 <= items.length; i += 2) {
    out.push([items[i], items[i + 1]] as [T, T]);
  }
  return out;
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
