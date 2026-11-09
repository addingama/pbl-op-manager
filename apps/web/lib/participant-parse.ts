import type { Participant, ParticipantStatus } from './session-detail';

const STATUSES: readonly ParticipantStatus[] = [
  'REGISTERED',
  'WAITLISTED',
  'ACTIVE',
  'UNAVAILABLE',
  'LEFT',
  'REMOVED',
];

function isParticipantStatus(value: string): value is ParticipantStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function objectRecord(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null) return null;
  return data as Record<string, unknown>;
}

export function parseParticipant(data: unknown): Participant {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid participant payload');
  }
  const row = data as Record<string, unknown>;
  const status = row['status'];
  if (typeof status !== 'string' || !isParticipantStatus(status)) {
    throw new Error('Invalid participant status');
  }
  return {
    id: String(row['id']),
    playerId: String(row['playerId']),
    displayName: String(row['displayName']),
    status,
    waitlistPos: typeof row['waitlistPos'] === 'number' ? row['waitlistPos'] : null,
    joinedAt: String(row['joinedAt']),
    leftAt: row['leftAt'] === null || typeof row['leftAt'] === 'string' ? row['leftAt'] : null,
  };
}
