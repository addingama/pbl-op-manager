import { describe, expect, it } from 'vitest';
import { at, makePlayers, pairUp, playingIds, simulateSession } from './test-support.js';
import type { GeneratorMode } from './types.js';

const MODES: readonly GeneratorMode[] = [
  'RANDOM',
  'BALANCED_ELO',
  'MEXICANO',
  'AMERICANO',
  'FIXED_PARTNER',
];

describe.each(MODES)('%s: 12 players / 2 courts / 10 rounds', (mode) => {
  it.each(['s1', 's2', 's3', 's4', 's5'])(
    'seed %s: equal play time and no back-to-back rests',
    (seed) => {
      const players = makePlayers(12);
      const { rounds } = simulateSession({
        mode,
        players,
        courts: 2,
        rounds: 10,
        seed,
        fixedTeams: pairUp(players),
      });

      const games = new Map(players.map((p) => [p.id, 0]));
      let previousResting = new Set<string>();
      for (const round of rounds) {
        for (const id of playingIds(round)) games.set(id, (games.get(id) ?? 0) + 1);
        const counts = [...games.values()];
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);

        for (const id of round.resting) expect(previousResting.has(id)).toBe(false);
        previousResting = new Set(round.resting);
      }
    },
  );
});

describe('late joiners and early leavers', () => {
  it('schedules a late joiner in the round they arrive', () => {
    const players = makePlayers(13);
    const { rounds } = simulateSession({
      mode: 'AMERICANO',
      players,
      courts: 2,
      rounds: 5,
      seed: 'late',
      joinRound: new Map([['p13', 3]]),
    });
    expect(playingIds(at(rounds, 0))).not.toContain('p13');
    expect(playingIds(at(rounds, 1))).not.toContain('p13');
    expect(playingIds(at(rounds, 2))).toContain('p13');
  });

  it('simply stops scheduling a player who leaves', () => {
    const players = makePlayers(12);
    const { rounds, previousRounds } = simulateSession({
      mode: 'BALANCED_ELO',
      players,
      courts: 2,
      rounds: 3,
      seed: 'leave',
    });
    expect(rounds).toHaveLength(3);
    const remaining = players.filter((p) => p.id !== 'p05');
    const { rounds: after } = simulateSession({
      mode: 'BALANCED_ELO',
      players: remaining,
      courts: 2,
      rounds: 1,
      seed: 'leave2',
    });
    expect(previousRounds).toHaveLength(3);
    expect(playingIds(at(after, 0))).not.toContain('p05');
  });
});
