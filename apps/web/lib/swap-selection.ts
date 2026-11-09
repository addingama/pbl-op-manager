export type SwapPhase =
  { readonly kind: 'idle' } | { readonly kind: 'armed'; readonly playerId: string };

export type SwapTapResult =
  | { readonly action: 'idle' }
  | { readonly action: 'arm'; readonly playerId: string }
  | { readonly action: 'commit'; readonly a: string; readonly b: string };

export function reduceSwapTap(
  phase: SwapPhase,
  playerId: string,
  selectable: boolean,
): SwapTapResult {
  if (!selectable) return { action: 'idle' };
  if (phase.kind === 'idle') return { action: 'arm', playerId };
  if (phase.playerId === playerId) return { action: 'idle' };
  return { action: 'commit', a: phase.playerId, b: playerId };
}

export function nextSwapPhase(result: SwapTapResult): SwapPhase {
  if (result.action === 'idle') return { kind: 'idle' };
  if (result.action === 'arm') return { kind: 'armed', playerId: result.playerId };
  return { kind: 'idle' };
}

export function playerSlotSwappable(
  round: {
    matches: readonly {
      status: string;
      team1: readonly [string, string];
      team2: readonly [string, string];
    }[];
    resting: readonly string[];
  },
  playerId: string,
): boolean {
  const inResting = round.resting.includes(playerId);
  if (inResting) return true;
  for (const match of round.matches) {
    if (match.status !== 'SCHEDULED') continue;
    const players = [...match.team1, ...match.team2];
    if (players.includes(playerId)) return true;
  }
  return false;
}
