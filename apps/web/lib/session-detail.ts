export type ParticipantStatus =
  'REGISTERED' | 'WAITLISTED' | 'ACTIVE' | 'UNAVAILABLE' | 'LEFT' | 'REMOVED';

export interface Participant {
  readonly id: string;
  readonly playerId: string;
  readonly displayName: string;
  readonly status: ParticipantStatus;
  readonly waitlistPos: number | null;
  readonly joinedAt: string;
  readonly leftAt: string | null;
}

export function buildPlayerNameMap(participants: readonly Participant[]): Map<string, string> {
  return new Map(participants.map((p) => [p.playerId, p.displayName] as const));
}

export function formatPlayerPair(
  ids: readonly [string, string],
  names: Map<string, string>,
): string {
  const a = names.get(ids[0]) ?? ids[0];
  const b = names.get(ids[1]) ?? ids[1];
  return `${a} & ${b}`;
}

export function filterPlayersForPicker(
  players: readonly { id: string; displayName: string; active: boolean }[],
  query: string,
  alreadyInSession: ReadonlySet<string>,
): { id: string; displayName: string }[] {
  const q = query.trim().toLowerCase();
  return players
    .filter((p) => p.active && !alreadyInSession.has(p.id))
    .filter((p) => q === '' || p.displayName.toLowerCase().includes(q))
    .slice(0, 20);
}

export function partitionParticipants(participants: readonly Participant[]): {
  roster: Participant[];
  waitlist: Participant[];
  inactive: Participant[];
} {
  const roster: Participant[] = [];
  const waitlist: Participant[] = [];
  const inactive: Participant[] = [];
  for (const p of participants) {
    if (p.status === 'WAITLISTED') waitlist.push(p);
    else if (p.status === 'REMOVED') inactive.push(p);
    else if (p.status === 'LEFT' || p.status === 'UNAVAILABLE') inactive.push(p);
    else roster.push(p);
  }
  waitlist.sort((a, b) => (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0));
  return { roster, waitlist, inactive };
}
