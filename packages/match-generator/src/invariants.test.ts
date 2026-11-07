import { describe, expect, it } from 'vitest';
import { GENERATOR_VERSION } from './constants.js';
import { generateRound } from './generate.js';
import { makePlayers, pairUp, playingIds, simulateSession } from './test-support.js';
import type { GeneratorMode } from './types.js';
import { validateRound } from './validate.js';

const MODES: readonly GeneratorMode[] = [
  'RANDOM',
  'BALANCED_ELO',
  'MEXICANO',
  'AMERICANO',
  'FIXED_PARTNER',
];
const PLAYER_COUNTS = [0, 1, 3, 4, 5, 7, 8, 9, 12, 13, 16, 17, 22];
const COURTS = [1, 2, 3, 6];
const SEEDS = ['a', 'b', 'c'];

describe.each(MODES)('%s: hard constraints on a first round', (mode) => {
  it.each(PLAYER_COUNTS)('%i players across court counts and seeds', (count) => {
    const players = makePlayers(count);
    const fixedTeams = pairUp(players);
    for (const courts of COURTS) {
      for (const seed of SEEDS) {
        const round = generateRound({
          mode,
          courts,
          seed,
          participants: players,
          previousRounds: [],
          fixedTeams,
        });
        const ids = players.map((p) => p.id);
        expect(validateRound(round.matches, courts, ids)).toEqual([]);

        const schedulable = mode === 'FIXED_PARTNER' ? fixedTeams.length * 2 : count;
        expect(round.matches).toHaveLength(Math.min(courts, Math.floor(schedulable / 4)));
        expect(round.matches.map((m) => m.court)).toEqual(round.matches.map((_, i) => i + 1));

        const playing = playingIds(round);
        expect([...playing, ...round.resting].sort()).toEqual([...ids].sort());
        expect(round.resting).toEqual([...round.resting].sort());
        expect(round.generatorVersion).toBe(GENERATOR_VERSION);
        expect(round.seed).toBe(seed);
        expect(round.mode).toBe(mode);
      }
    }
  });
});

describe.each(MODES)('%s: hard constraints across a simulated session', (mode) => {
  it.each([
    [10, 2],
    [13, 3],
    [17, 4],
  ])('%i players on %i courts for 12 rounds', (count, courts) => {
    const players = makePlayers(count);
    const { rounds } = simulateSession({
      mode,
      players,
      courts,
      rounds: 12,
      seed: `${mode}-${String(count)}`,
      fixedTeams: pairUp(players),
    });
    for (const round of rounds) {
      expect(
        validateRound(
          round.matches,
          courts,
          players.map((p) => p.id),
        ),
      ).toEqual([]);
    }
  });
});
