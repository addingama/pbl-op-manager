import { z } from 'zod';

const idSchema = z.object({ id: z.string() });
const playerListSchema = z.object({
  players: z.array(z.object({ id: z.string(), displayName: z.string() })),
});
const sessionListSchema = z.object({ sessions: z.array(z.unknown()) });
const participantsSchema = z.object({
  participants: z.array(z.object({ status: z.string(), waitlistPos: z.number().nullable() })),
});
const participantSchema = z.object({
  participant: z.object({ status: z.string(), waitlistPos: z.number().nullable() }),
});

export function parseId(body: unknown): string {
  return idSchema.parse(body).id;
}

export function parsePlayerList(body: unknown) {
  return playerListSchema.parse(body);
}

export function parseSessionList(body: unknown) {
  return sessionListSchema.parse(body);
}

export function parseParticipants(body: unknown) {
  return participantsSchema.parse(body);
}

export function parseParticipant(body: unknown) {
  return participantSchema.parse(body);
}
