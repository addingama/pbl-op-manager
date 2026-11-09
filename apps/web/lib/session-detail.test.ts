import { describe, expect, it } from 'vitest';
import { filterPlayersForPicker, partitionParticipants } from './session-detail';

describe('filterPlayersForPicker', () => {
  const players = [
    { id: '1', displayName: 'Alice', active: true },
    { id: '2', displayName: 'Bob', active: true },
    { id: '3', displayName: 'Inactive', active: false },
  ];

  it('excludes players already on the session', () => {
    const found = filterPlayersForPicker(players, '', new Set(['1']));
    expect(found.map((p) => p.id)).toEqual(['2']);
  });

  it('filters by case-insensitive substring', () => {
    const found = filterPlayersForPicker(players, 'ali', new Set());
    expect(found).toHaveLength(1);
    expect(found[0]?.displayName).toBe('Alice');
  });
});

describe('partitionParticipants', () => {
  it('splits roster, waitlist, and inactive', () => {
    const parts = partitionParticipants([
      {
        id: 'a',
        playerId: 'p1',
        displayName: 'A',
        status: 'REGISTERED',
        waitlistPos: null,
        joinedAt: '',
        leftAt: null,
      },
      {
        id: 'b',
        playerId: 'p2',
        displayName: 'B',
        status: 'WAITLISTED',
        waitlistPos: 1,
        joinedAt: '',
        leftAt: null,
      },
      {
        id: 'c',
        playerId: 'p3',
        displayName: 'C',
        status: 'LEFT',
        waitlistPos: null,
        joinedAt: '',
        leftAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(parts.roster).toHaveLength(1);
    expect(parts.waitlist).toHaveLength(1);
    expect(parts.inactive).toHaveLength(1);
  });
});
