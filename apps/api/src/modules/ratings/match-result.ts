import { assertValidMatch, type MatchResult, type Team, type TeamSide } from '@pbl/elo-engine';
import { AppError, ErrorCode } from '@pbl/shared';

type AssignmentRow = {
  readonly team: number | null;
  readonly position: number | null;
  readonly playerId: string;
};

export function teamsFromAssignments(assignments: readonly AssignmentRow[]): {
  team1: Team;
  team2: Team;
} {
  const slots = [...assignments].sort(
    (a, b) => (a.team ?? 0) - (b.team ?? 0) || (a.position ?? 0) - (b.position ?? 0),
  );
  const team1: Team = [slots[0]?.playerId ?? '', slots[1]?.playerId ?? ''];
  const team2: Team = [slots[2]?.playerId ?? '', slots[3]?.playerId ?? ''];
  if (team1.some((id) => id === '') || team2.some((id) => id === '')) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Match does not have four players');
  }
  return { team1, team2 };
}

export function buildMatchResult(
  matchId: string,
  winnerTeam: TeamSide,
  assignments: readonly AssignmentRow[],
): MatchResult {
  const { team1, team2 } = teamsFromAssignments(assignments);
  const result: MatchResult = { matchId, team1, team2, winner: winnerTeam };
  try {
    assertValidMatch(result);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Invalid match lineup');
  }
  return result;
}
