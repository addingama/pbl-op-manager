export type PlayerId = string;

export type Team = readonly [PlayerId, PlayerId];

export type GeneratorMode = 'RANDOM' | 'BALANCED_ELO' | 'MEXICANO' | 'AMERICANO' | 'FIXED_PARTNER';

/** An active, present participant who may be scheduled this round. */
export interface Participant {
  readonly id: PlayerId;
  /** Current lifetime Elo. */
  readonly rating: number;
}

export interface PreviousMatch {
  readonly team1: Team;
  readonly team2: Team;
  /** Official winner if known; null while unconfirmed (still counts as played). Omit cancelled matches. */
  readonly winner: 1 | 2 | null;
}

export interface PreviousRound {
  readonly roundNumber: number;
  readonly matches: readonly PreviousMatch[];
}

export interface GeneratorSettings {
  /** Penalty per previous time two teammates partnered. */
  readonly repeatPartnerWeight: number;
  /** Penalty per previous time two players (or fixed teams) faced each other. */
  readonly repeatOpponentWeight: number;
  /** Penalty per Elo point of team-average difference within a match. */
  readonly ratingDiffWeight: number;
  /** Seeded local-search restarts; more = better optimum, slower. */
  readonly restarts: number;
}

export interface GenerateRoundInput {
  readonly mode: GeneratorMode;
  readonly courts: number;
  readonly seed: string;
  readonly participants: readonly Participant[];
  /** All earlier rounds of this session (any order). */
  readonly previousRounds: readonly PreviousRound[];
  /** Required for FIXED_PARTNER; ignored otherwise. */
  readonly fixedTeams?: readonly Team[];
  readonly settings?: Partial<GeneratorSettings>;
}

export interface GeneratedMatch {
  /** 1-based court number. */
  readonly court: number;
  readonly team1: Team;
  readonly team2: Team;
}

export interface MatchDiagnostics {
  readonly court: number;
  readonly teamRatingDiff: number;
  /** Teams (0–2) whose two players have partnered before this session. */
  readonly repeatedPartners: number;
  /** Cross-team player pairs (0–4) that have faced each other before this session. */
  readonly repeatedOpponents: number;
}

export interface RoundDiagnostics {
  readonly matches: readonly MatchDiagnostics[];
  readonly totalTeamRatingDiff: number;
  readonly totalRepeatedPartners: number;
  readonly totalRepeatedOpponents: number;
}

export interface GeneratedRound {
  readonly generatorVersion: string;
  readonly mode: GeneratorMode;
  readonly seed: string;
  /** Effective settings (defaults merged with overrides); persist with the round. */
  readonly settings: GeneratorSettings;
  readonly matches: readonly GeneratedMatch[];
  /** Participants not scheduled this round, sorted by id. */
  readonly resting: readonly PlayerId[];
  readonly diagnostics: RoundDiagnostics;
}
