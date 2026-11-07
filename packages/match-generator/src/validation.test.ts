import { describe, expect, it } from 'vitest';
import { MatchGeneratorError } from './errors.js';
import { generateRound } from './generate.js';
import { buildSessionHistory } from './history.js';
import { makePlayers } from './test-support.js';
import type { GenerateRoundInput } from './types.js';
import { validateRound } from './validate.js';

const base: GenerateRoundInput = {
  mode: 'RANDOM',
  courts: 2,
  seed: 's',
  participants: makePlayers(8),
  previousRounds: [],
};

const expectCode = (input: GenerateRoundInput, code: string) => {
  expect(() => generateRound(input)).toThrow(MatchGeneratorError);
  try {
    generateRound(input);
  } catch (error) {
    expect((error as MatchGeneratorError).code).toBe(code);
  }
};

describe('generateRound input validation', () => {
  it('rejects invalid courts, seed, participants and settings', () => {
    expectCode({ ...base, courts: 0 }, 'INVALID_COURTS');
    expectCode({ ...base, courts: 1.5 }, 'INVALID_COURTS');
    expectCode({ ...base, seed: '' }, 'INVALID_SEED');
    expectCode(
      { ...base, participants: [...makePlayers(4), { id: 'p01', rating: 1 }] },
      'DUPLICATE_PARTICIPANT',
    );
    expectCode({ ...base, participants: [{ id: 'x', rating: Number.NaN }] }, 'INVALID_RATING');
    expectCode({ ...base, settings: { repeatPartnerWeight: -1 } }, 'INVALID_SETTINGS');
    expectCode({ ...base, settings: { restarts: 0 } }, 'INVALID_SETTINGS');
  });

  it('requires valid fixed teams for FIXED_PARTNER', () => {
    expectCode({ ...base, mode: 'FIXED_PARTNER' }, 'INVALID_FIXED_TEAMS');
    expectCode(
      { ...base, mode: 'FIXED_PARTNER', fixedTeams: [['p01', 'p01']] },
      'INVALID_FIXED_TEAMS',
    );
    expectCode(
      {
        ...base,
        mode: 'FIXED_PARTNER',
        fixedTeams: [
          ['p01', 'p02'],
          ['p02', 'p03'],
        ],
      },
      'INVALID_FIXED_TEAMS',
    );
  });
});

describe('validateRound', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('accepts a valid round', () => {
    expect(
      validateRound(
        [
          { court: 1, team1: ['a', 'b'], team2: ['c', 'd'] },
          { court: 2, team1: ['e', 'f'], team2: ['g', 'h'] },
        ],
        2,
        ids,
      ),
    ).toEqual([]);
  });

  it('reports every kind of violation', () => {
    const kinds = validateRound(
      [
        { court: 1, team1: ['a', 'a'], team2: ['c', 'd'] },
        { court: 1, team1: ['c', 'f'], team2: ['g', 'zz'] },
        { court: 3, team1: ['e', 'h'], team2: ['b', 'f'] },
      ],
      2,
      ids,
    ).map((v) => v.kind);
    expect(new Set(kinds)).toEqual(
      new Set([
        'TOO_MANY_MATCHES',
        'DUPLICATE_PLAYER_IN_MATCH',
        'DUPLICATE_COURT',
        'PLAYER_IN_MULTIPLE_MATCHES',
        'NOT_A_PARTICIPANT',
        'INVALID_COURT',
      ]),
    );
  });
});

describe('buildSessionHistory', () => {
  it('derives games, wins, last round, partners and opponents', () => {
    const history = buildSessionHistory([
      { roundNumber: 2, matches: [{ team1: ['a', 'b'], team2: ['c', 'd'], winner: null }] },
      { roundNumber: 1, matches: [{ team1: ['a', 'c'], team2: ['b', 'd'], winner: 1 }] },
    ]);
    expect(history.statsOf('a')).toEqual({ gamesPlayed: 2, wins: 1, lastPlayedRound: 2 });
    expect(history.statsOf('b')).toEqual({ gamesPlayed: 2, wins: 0, lastPlayedRound: 2 });
    expect(history.statsOf('new')).toEqual({ gamesPlayed: 0, wins: 0, lastPlayedRound: null });
    expect(history.partnerCount('b', 'a')).toBe(1);
    expect(history.opponentCount('a', 'd')).toBe(2);
    expect(history.teamOpponentCount(['b', 'a'], ['d', 'c'])).toBe(1);
    expect(history.hasResults).toBe(true);
  });
});
