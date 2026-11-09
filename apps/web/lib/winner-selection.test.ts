import { describe, expect, it } from 'vitest';
import { tapWinnerPick, winnersForConfirmAll } from './winner-selection';

describe('tapWinnerPick', () => {
  it('opens sheet when team changes', () => {
    const first = tapWinnerPick(null, 'm1', 1);
    expect(first.openConfirmSheet).toBe(true);
    expect(first.pick).toEqual({ matchId: 'm1', winnerTeam: 1 });
    const same = tapWinnerPick(first.pick, 'm1', 1);
    expect(same.openConfirmSheet).toBe(false);
    const other = tapWinnerPick(first.pick, 'm1', 2);
    expect(other.openConfirmSheet).toBe(true);
  });
});

describe('winnersForConfirmAll', () => {
  it('includes only open matches with picks', () => {
    const picks = new Map<string, 1 | 2>([
      ['m1', 2],
      ['m2', 1],
    ]);
    const rows = winnersForConfirmAll(picks, [
      { id: 'm1', status: 'IN_PROGRESS' },
      { id: 'm2', status: 'COMPLETED', winnerTeam: 1 },
      { id: 'm3', status: 'SCHEDULED' },
    ]);
    expect(rows).toEqual([{ matchId: 'm1', winnerTeam: 2 }]);
  });
});
