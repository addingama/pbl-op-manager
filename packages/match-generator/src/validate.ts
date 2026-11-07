import type { GeneratedMatch, PlayerId } from './types.js';

export type RoundViolation =
  | { readonly kind: 'TOO_MANY_MATCHES'; readonly courts: number; readonly matches: number }
  | { readonly kind: 'INVALID_COURT'; readonly court: number }
  | { readonly kind: 'DUPLICATE_COURT'; readonly court: number }
  | {
      readonly kind: 'DUPLICATE_PLAYER_IN_MATCH';
      readonly court: number;
      readonly playerId: PlayerId;
    }
  | { readonly kind: 'PLAYER_IN_MULTIPLE_MATCHES'; readonly playerId: PlayerId }
  | { readonly kind: 'NOT_A_PARTICIPANT'; readonly playerId: PlayerId };

/**
 * Checks the PRD hard constraints for a round (generated, manually built, or
 * after swaps): 4 distinct players per match, no player in two matches, only
 * eligible participants, at most one match per court. Returns [] when valid.
 */
export function validateRound(
  matches: readonly GeneratedMatch[],
  courts: number,
  eligiblePlayerIds: Iterable<PlayerId>,
): RoundViolation[] {
  const violations: RoundViolation[] = [];
  const eligible = new Set(eligiblePlayerIds);
  const seenPlayers = new Set<PlayerId>();
  const seenCourts = new Set<number>();

  if (matches.length > courts)
    violations.push({ kind: 'TOO_MANY_MATCHES', courts, matches: matches.length });

  for (const { court, team1, team2 } of matches) {
    if (!Number.isInteger(court) || court < 1 || court > courts)
      violations.push({ kind: 'INVALID_COURT', court });
    if (seenCourts.has(court)) violations.push({ kind: 'DUPLICATE_COURT', court });
    seenCourts.add(court);

    const inMatch = new Set<PlayerId>();
    for (const playerId of [...team1, ...team2]) {
      if (inMatch.has(playerId)) {
        violations.push({ kind: 'DUPLICATE_PLAYER_IN_MATCH', court, playerId });
        continue;
      }
      inMatch.add(playerId);
      if (seenPlayers.has(playerId))
        violations.push({ kind: 'PLAYER_IN_MULTIPLE_MATCHES', playerId });
      seenPlayers.add(playerId);
      if (!eligible.has(playerId)) violations.push({ kind: 'NOT_A_PARTICIPANT', playerId });
    }
  }
  return violations;
}
