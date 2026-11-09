import type { OpenPlayStatus, ParticipantStatus, PrismaClient } from '@pbl/database';

/** Statuses that occupy a capacity slot (not waitlisted / gone). */
const OCCUPIES_SLOT: readonly ParticipantStatus[] = ['REGISTERED', 'ACTIVE', 'UNAVAILABLE'];

export function participantStatusForNew(
  sessionStatus: OpenPlayStatus,
  onWaitlist: boolean,
): ParticipantStatus {
  if (onWaitlist) return 'WAITLISTED';
  if (sessionStatus === 'LIVE') return 'ACTIVE';
  return 'REGISTERED';
}

export async function occupiedCount(prisma: PrismaClient, openPlayId: string): Promise<number> {
  return prisma.openPlayParticipant.count({
    where: { openPlayId, status: { in: [...OCCUPIES_SLOT] } },
  });
}

export async function nextWaitlistPos(prisma: PrismaClient, openPlayId: string): Promise<number> {
  const max = await prisma.openPlayParticipant.aggregate({
    where: { openPlayId, status: 'WAITLISTED' },
    _max: { waitlistPos: true },
  });
  return (max._max.waitlistPos ?? 0) + 1;
}

export function shouldWaitlist(
  capacity: number | null,
  occupied: number,
  adding: number,
): { waitlisted: number; registered: number } {
  if (capacity === null) return { waitlisted: 0, registered: adding };
  const slotsLeft = Math.max(0, capacity - occupied);
  const registered = Math.min(adding, slotsLeft);
  return { waitlisted: adding - registered, registered };
}
