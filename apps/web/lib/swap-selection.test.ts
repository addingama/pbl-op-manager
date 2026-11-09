import { describe, expect, it } from 'vitest';
import { nextSwapPhase, playerSlotSwappable, reduceSwapTap } from './swap-selection';

describe('reduceSwapTap', () => {
  it('arms first player then commits pair', () => {
    const first = reduceSwapTap({ kind: 'idle' }, 'p1', true);
    expect(first).toEqual({ action: 'arm', playerId: 'p1' });
    const armed = nextSwapPhase(first);
    const second = reduceSwapTap(armed, 'p2', true);
    expect(second).toEqual({ action: 'commit', a: 'p1', b: 'p2' });
  });

  it('clears arm when tapping same player', () => {
    const armed = { kind: 'armed' as const, playerId: 'p1' };
    const again = reduceSwapTap(armed, 'p1', true);
    expect(again).toEqual({ action: 'idle' });
  });
});

describe('playerSlotSwappable', () => {
  it('allows resting and scheduled-court players only', () => {
    const round = {
      matches: [
        {
          status: 'IN_PROGRESS',
          team1: ['a', 'b'] as const,
          team2: ['c', 'd'] as const,
        },
        {
          status: 'SCHEDULED',
          team1: ['e', 'f'] as const,
          team2: ['g', 'h'] as const,
        },
      ],
      resting: ['r1'],
    };
    expect(playerSlotSwappable(round, 'r1')).toBe(true);
    expect(playerSlotSwappable(round, 'e')).toBe(true);
    expect(playerSlotSwappable(round, 'a')).toBe(false);
  });
});
