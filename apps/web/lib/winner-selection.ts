export type WinnerPick = {
  readonly matchId: string;
  readonly winnerTeam: 1 | 2;
};

export function tapWinnerPick(
  current: WinnerPick | null,
  matchId: string,
  team: 1 | 2,
): { readonly pick: WinnerPick; readonly openConfirmSheet: boolean } {
  const pick = { matchId, winnerTeam: team };
  const changed = current === null || current.matchId !== matchId || current.winnerTeam !== team;
  return { pick, openConfirmSheet: changed };
}

export function winnersForConfirmAll(
  picks: ReadonlyMap<string, 1 | 2>,
  matches: readonly {
    id: string;
    status: string;
    winnerTeam?: number | null | undefined;
  }[],
): { matchId: string; winnerTeam: 1 | 2 }[] {
  const out: { matchId: string; winnerTeam: 1 | 2 }[] = [];
  for (const match of matches) {
    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') continue;
    const team = picks.get(match.id);
    if (team === 1 || team === 2) out.push({ matchId: match.id, winnerTeam: team });
  }
  return out;
}
