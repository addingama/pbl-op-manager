import { describe, expect, it } from 'vitest';
import { generateRound } from './generate.js';
import {
  at,
  makePlayers,
  pairUp,
  partnerCounts,
  playingIds,
  simulateSession,
} from './test-support.js';
import type { Participant, PreviousRound, Team } from './types.js';

const teamKey = (team: Team) => [...team].sort().join('+');

describe('BALANCED_ELO', () => {
  it('finds the perfectly balanced split for four players', () => {
    const players: Participant[] = [
      { id: 'a', rating: 1400 },
      { id: 'b', rating: 1300 },
      { id: 'c', rating: 1100 },
      { id: 'd', rating: 1000 },
    ];
    const round = generateRound({
      mode: 'BALANCED_ELO',
      courts: 1,
      seed: 'x',
      participants: players,
      previousRounds: [],
    });
    const match = at(round.matches, 0);
    expect(new Set([teamKey(match.team1), teamKey(match.team2)])).toEqual(new Set(['a+d', 'b+c']));
    expect(round.diagnostics.totalTeamRatingDiff).toBe(0);
  });

  it('beats a random arrangement and finds near-perfect balance (16 players, 4 courts)', () => {
    const players = makePlayers(16, 600);
    let balancedTotal = 0;
    let randomTotal = 0;
    for (let i = 0; i < 30; i++) {
      const seed = `cmp-${String(i)}`;
      const common = { courts: 4, seed, participants: players, previousRounds: [] };
      const balanced = generateRound({ ...common, mode: 'BALANCED_ELO' }).diagnostics;
      const random = generateRound({ ...common, mode: 'RANDOM' }).diagnostics;
      expect(balanced.totalTeamRatingDiff).toBeLessThanOrEqual(random.totalTeamRatingDiff);
      // Evenly spaced ratings always admit a 0-difference split; allow one 40-point step of slack.
      expect(balanced.totalTeamRatingDiff).toBeLessThanOrEqual(40);
      balancedTotal += balanced.totalTeamRatingDiff;
      randomTotal += random.totalTeamRatingDiff;
    }
    expect(balancedTotal).toBeLessThan(randomTotal);
  });
});

describe('MEXICANO', () => {
  const players: Participant[] = [
    { id: 'p1', rating: 1500 },
    { id: 'p2', rating: 1400 },
    { id: 'p3', rating: 1300 },
    { id: 'p4', rating: 1200 },
    { id: 'p5', rating: 1100 },
    { id: 'p6', rating: 1000 },
    { id: 'p7', rating: 900 },
    { id: 'p8', rating: 800 },
  ];

  it('uses Balanced Elo for the first round', () => {
    const common = { courts: 2, seed: 'm', participants: players, previousRounds: [] };
    expect(generateRound({ ...common, mode: 'MEXICANO' }).matches).toEqual(
      generateRound({ ...common, mode: 'BALANCED_ELO' }).matches,
    );
  });

  it('ranks by wins then Elo and pairs 1st+4th vs 2nd+3rd per group of four', () => {
    const previousRounds: PreviousRound[] = [
      {
        roundNumber: 1,
        matches: [
          { team1: ['p1', 'p2'], team2: ['p3', 'p4'], winner: 1 },
          { team1: ['p5', 'p6'], team2: ['p7', 'p8'], winner: 1 },
        ],
      },
    ];
    const round = generateRound({
      mode: 'MEXICANO',
      courts: 2,
      seed: 'm2',
      participants: players,
      previousRounds,
    });
    expect(round.matches).toEqual([
      { court: 1, team1: ['p1', 'p6'], team2: ['p2', 'p5'] },
      { court: 2, team1: ['p3', 'p8'], team2: ['p4', 'p7'] },
    ]);
  });

  it('prefers win rate over Elo when wins are tied', () => {
    const previousRounds: PreviousRound[] = [
      {
        roundNumber: 1,
        matches: [
          { team1: ['p7', 'p8'], team2: ['p5', 'p6'], winner: 1 },
          { team1: ['p1', 'p2'], team2: ['p3', 'p4'], winner: 2 },
        ],
      },
      {
        roundNumber: 2,
        matches: [{ team1: ['p1', 'p2'], team2: ['p5', 'p6'], winner: 1 }],
      },
    ];
    // wins: p7,p8 = 1/1; p1,p2 = 1/2; p3,p4 = 1/1; p5,p6 = 0/2
    const round = generateRound({
      mode: 'MEXICANO',
      courts: 2,
      seed: 'm3',
      participants: players,
      previousRounds,
    });
    // 1/1 group by Elo: p3, p4, p7, p8 → top court
    expect(round.matches[0]).toEqual({ court: 1, team1: ['p3', 'p8'], team2: ['p4', 'p7'] });
    expect(round.matches[1]).toEqual({ court: 2, team1: ['p1', 'p6'], team2: ['p2', 'p5'] });
  });
});

describe('AMERICANO', () => {
  it('avoids repeated partners while unused pairs remain (12 players, 3 courts, 5 rounds)', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { rounds } = simulateSession({
        mode: 'AMERICANO',
        players: makePlayers(12),
        courts: 3,
        rounds: 5,
        seed,
      });
      expect(Math.max(...partnerCounts(rounds).values())).toBe(1);
    }
  });

  it('rotates partners across 8 players / 2 courts with few repeats', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { rounds } = simulateSession({
        mode: 'AMERICANO',
        players: makePlayers(8),
        courts: 2,
        rounds: 4,
        seed,
      });
      expect(Math.max(...partnerCounts(rounds).values())).toBe(1);
    }
  });
});

describe('FIXED_PARTNER', () => {
  const players = makePlayers(10);
  const fixedTeams = pairUp(players);
  const fixedKeys = new Set(fixedTeams.map(teamKey));

  it('keeps every team intact and rotates the resting team with an odd team count', () => {
    const { rounds } = simulateSession({
      mode: 'FIXED_PARTNER',
      players,
      courts: 2,
      rounds: 5,
      seed: 'fp',
      fixedTeams,
    });
    const restCount = new Map(fixedTeams.map((t) => [teamKey(t), 0]));
    for (const round of rounds) {
      for (const m of round.matches) {
        expect(fixedKeys.has(teamKey(m.team1))).toBe(true);
        expect(fixedKeys.has(teamKey(m.team2))).toBe(true);
      }
      const playing = new Set(playingIds(round));
      for (const team of fixedTeams) {
        if (!playing.has(team[0]))
          restCount.set(teamKey(team), (restCount.get(teamKey(team)) ?? 0) + 1);
      }
    }
    expect([...restCount.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  it('rests unpaired players and partners of absent players', () => {
    const extra: Participant = { id: 'solo', rating: 1000 };
    const present = [...players.filter((p) => p.id !== 'p01'), extra];
    const round = generateRound({
      mode: 'FIXED_PARTNER',
      courts: 3,
      seed: 'fp2',
      participants: present,
      previousRounds: [],
      fixedTeams,
    });
    expect(round.resting).toContain('solo');
    expect(round.resting).toContain('p02');
    expect(round.matches).toHaveLength(2);
  });
});
