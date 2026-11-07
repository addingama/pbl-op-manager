import type { Prisma, PrismaClient } from '@pbl/database';

export interface AuditEntry {
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before?: Prisma.InputJsonValue;
  readonly after?: Prisma.InputJsonValue;
  readonly reason?: string;
  readonly requestId?: string;
}

type AuditClient = Pick<PrismaClient, 'auditLog'>;

/** Writes an audit row (call inside the same transaction as the change when possible). */
export async function writeAudit(client: AuditClient, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before !== undefined ? { before: entry.before } : {}),
      ...(entry.after !== undefined ? { after: entry.after } : {}),
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      ...(entry.requestId !== undefined ? { requestId: entry.requestId } : {}),
    },
  });
}
