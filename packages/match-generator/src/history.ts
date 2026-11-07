import type { PlayerId, PreviousRound, Team } from './types.js';

export interface PlayerSessionStats {
  readonly gamesPlayed: number;
  readonly wins: number;
  /** Highest round number played, or null if the player has not played this session. */
  readonly lastPlayedRound: number | null;
}

export interface SessionHistory {
  readonly stats: ReadonlyMap<PlayerId, PlayerSessionStats>;
  readonly hasResults: boolean;
  partnerCount(a: PlayerId, b: PlayerId): number;
  opponentCount(a: PlayerId, b: PlayerId): number;
  /** Times two fixed teams (by unordered player pair) have faced each other. */
  teamOpponentCount(a: Team, b: Team): number;
  statsOf(id: PlayerId): PlayerSessionStats;
}

const EMPTY_STATS: PlayerSessionStats = { gamesPlayed: 0, wins: 0, lastPlayedRound: null };

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const teamKey = (team: Team): string => pairKey(team[0], team[1]);

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Derives all session statistics the generator needs from earlier rounds. */
export function buildSessionHistory(previousRounds: readonly PreviousRound[]): SessionHistory {
  const stats = new Map<PlayerId, PlayerSessionStats>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const teamOpponents = new Map<string, number>();
  let hasResults = false;

  for (const round of previousRounds) {
    for (const match of round.matches) {
      if (match.winner !== null) hasResults = true;
      bump(partners, teamKey(match.team1));
      bump(partners, teamKey(match.team2));
      bump(teamOpponents, pairKey(teamKey(match.team1), teamKey(match.team2)));

      for (const a of match.team1) for (const b of match.team2) bump(opponents, pairKey(a, b));

      const sides: readonly [Team, 1 | 2][] = [
        [match.team1, 1],
        [match.team2, 2],
      ];
      for (const [team, side] of sides) {
        for (const id of team) {
          const prev = stats.get(id) ?? EMPTY_STATS;
          stats.set(id, {
            gamesPlayed: prev.gamesPlayed + 1,
            wins: prev.wins + (match.winner === side ? 1 : 0),
            lastPlayedRound:
              prev.lastPlayedRound === null
                ? round.roundNumber
                : Math.max(prev.lastPlayedRound, round.roundNumber),
          });
        }
      }
    }
  }

  return {
    stats,
    hasResults,
    partnerCount: (a, b) => partners.get(pairKey(a, b)) ?? 0,
    opponentCount: (a, b) => opponents.get(pairKey(a, b)) ?? 0,
    teamOpponentCount: (a, b) => teamOpponents.get(pairKey(teamKey(a), teamKey(b))) ?? 0,
    statsOf: (id) => stats.get(id) ?? EMPTY_STATS,
  };
}
