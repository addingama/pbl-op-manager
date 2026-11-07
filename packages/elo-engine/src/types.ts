export type PlayerId = string;

export type TeamSide = 1 | 2;

export type Team = readonly [PlayerId, PlayerId];

/** An official (admin-confirmed) Win/Loss result. */
export interface MatchResult {
  readonly matchId: string;
  readonly team1: Team;
  readonly team2: Team;
  readonly winner: TeamSide;
}

export type RatingSnapshot = ReadonlyMap<PlayerId, number>;

export interface PlayerRatingChange {
  readonly playerId: PlayerId;
  readonly team: TeamSide;
  /** 1 = win, 0 = loss. */
  readonly result: 0 | 1;
  readonly ratingBefore: number;
  readonly teamRating: number;
  readonly opponentRating: number;
  readonly expected: number;
  readonly delta: number;
  readonly ratingAfter: number;
}

export interface MatchRatingChange {
  readonly matchId: string;
  readonly team1Rating: number;
  readonly team2Rating: number;
  /** Expected score of team 1 (team 2 = 1 − this). */
  readonly expectedTeam1: number;
  /** Delta applied to each team-1 player; team 2 receives the exact negation. */
  readonly deltaTeam1: number;
  /** Team 1 players first (in input order), then team 2. */
  readonly changes: readonly [
    PlayerRatingChange,
    PlayerRatingChange,
    PlayerRatingChange,
    PlayerRatingChange,
  ];
}

export interface PlayerState {
  readonly rating: number;
  readonly peakRating: number;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly losses: number;
}

export type LedgerState = ReadonlyMap<PlayerId, PlayerState>;

export interface FoldResult {
  readonly state: LedgerState;
  /** One entry per input match, in input order. */
  readonly history: readonly MatchRatingChange[];
}
