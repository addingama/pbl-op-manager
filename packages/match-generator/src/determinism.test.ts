import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './constants.js';
import { generateRound } from './generate.js';
import { Random } from './random.js';
import { makePlayers, pairUp, simulateSession } from './test-support.js';
import type { GenerateRoundInput, GeneratorMode } from './types.js';

const MODES: readonly GeneratorMode[] = [
  'RANDOM',
  'BALANCED_ELO',
  'MEXICANO',
  'AMERICANO',
  'FIXED_PARTNER',
];

function inputAfterThreeRounds(mode: GeneratorMode, seed: string): GenerateRoundInput {
  const players = makePlayers(14);
  const fixedTeams = pairUp(players);
  const { previousRounds } = simulateSession({
    mode,
    players,
    courts: 3,
    rounds: 3,
    seed: 'history',
    fixedTeams,
  });
  return { mode, courts: 3, seed, participants: players, previousRounds, fixedTeams };
}

describe.each(MODES)('%s: reproducibility', (mode) => {
  it('returns an identical round for the same input and seed', () => {
    const input = inputAfterThreeRounds(mode, 'seed-123');
    expect(generateRound(input)).toEqual(generateRound(input));
  });

  it('does not depend on the order of participants, teams, or rounds', () => {
    const input = inputAfterThreeRounds(mode, 'seed-123');
    const shuffler = new Random('order');
    const reordered: GenerateRoundInput = {
      ...input,
      participants: shuffler.shuffle(input.participants),
      previousRounds: shuffler.shuffle(input.previousRounds),
      fixedTeams: shuffler
        .shuffle(input.fixedTeams ?? [])
        .map(([a, b]) => (shuffler.next() < 0.5 ? [a, b] : [b, a])),
    };
    expect(generateRound(reordered)).toEqual(generateRound(input));
  });

  it('produces different rounds for different seeds', () => {
    const outputs = new Set(
      ['s1', 's2', 's3', 's4', 's5', 's6'].map((seed) =>
        JSON.stringify(generateRound(inputAfterThreeRounds(mode, seed)).matches),
      ),
    );
    expect(outputs.size).toBeGreaterThan(1);
  });

  it('echoes the effective settings, merging overrides into mode defaults', () => {
    const round = generateRound({
      ...inputAfterThreeRounds(mode, 'x'),
      settings: { restarts: 3 },
    });
    expect(round.settings).toEqual({ ...DEFAULT_SETTINGS[mode], restarts: 3 });
  });
});

describe('Random', () => {
  it('is reproducible per seed and differs across seeds', () => {
    const a = new Random('seed');
    const b = new Random('seed');
    const c = new Random('other');
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('shuffles into a permutation without mutating the input', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = new Random('s').shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
