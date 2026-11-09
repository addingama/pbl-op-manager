import type { GeneratedMatch } from '@pbl/match-generator';

export function toRoundDetail(round: {
  id: string;
  openPlayId: string;
  number: number;
  mode: string;
  settings: unknown;
  seed: string | null;
  generatorVersion: string | null;
  ratingSnapshot: unknown;
  version: number;
  matches: {
    id: string;
    courtNumber: number;
    status: string;
    assignments: { team: number | null; position: number | null; playerId: string }[];
  }[];
  assignments: { playerId: string; status: string }[];
}) {
  const matches = round.matches.map((m) => {
    const slots = [...m.assignments].sort(
      (a, b) => (a.team ?? 0) - (b.team ?? 0) || (a.position ?? 0) - (b.position ?? 0),
    );
    const team1: [string, string] = [slots[0]?.playerId ?? '', slots[1]?.playerId ?? ''];
    const team2: [string, string] = [slots[2]?.playerId ?? '', slots[3]?.playerId ?? ''];
    if (team1.some((x) => x === '') || team2.some((x) => x === '')) {
      throw new Error('incomplete match assignment data');
    }
    return {
      id: m.id,
      courtNumber: m.courtNumber,
      status: m.status,
      team1,
      team2,
    };
  });
  const resting = round.assignments
    .filter((a) => a.status === 'RESTING')
    .map((a) => a.playerId)
    .sort();
  return {
    id: round.id,
    openPlayId: round.openPlayId,
    number: round.number,
    mode: round.mode,
    settings: round.settings as Record<string, unknown>,
    seed: round.seed,
    generatorVersion: round.generatorVersion,
    ratingSnapshot: round.ratingSnapshot as Record<string, unknown>,
    version: round.version,
    matches,
    resting,
  };
}

export function matchesFromManual(
  input: readonly {
    court: number;
    team1: readonly [string, string];
    team2: readonly [string, string];
  }[],
): GeneratedMatch[] {
  return input.map((m) => ({ court: m.court, team1: m.team1, team2: m.team2 }));
}
