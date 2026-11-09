import type { PrismaClient } from '@pbl/database';
import {
  AppError,
  ErrorCode,
  appDefaultsSchema,
  type Actor,
  type ChangePasswordBody,
  type CreateAdminBody,
  type UpdateAppDefaults,
} from '@pbl/shared';
import { hash, verify } from 'argon2';
import { writeAudit } from '../../lib/audit.js';
import { createUser, findUserByEmail } from '../auth/repo.js';
import { DEFAULT_APP_SETTINGS } from './defaults.js';
import * as repo from './repo.js';

function assertAdmin(actor: Actor): string {
  if (actor.kind !== 'admin') throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  return actor.userId;
}

export async function getAppSettings(prisma: PrismaClient) {
  const row = await repo.getSetting(prisma, repo.SETTINGS_KEY);
  if (row === null) return { defaults: DEFAULT_APP_SETTINGS };
  const parsed = appDefaultsSchema.safeParse(row.value);
  if (!parsed.success) return { defaults: DEFAULT_APP_SETTINGS };
  return { defaults: parsed.data };
}

export async function updateAppSettings(
  prisma: PrismaClient,
  actor: Actor,
  body: UpdateAppDefaults,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const current = (await getAppSettings(prisma)).defaults;
  const next = appDefaultsSchema.parse({ ...current, ...body });
  await repo.upsertSetting(prisma, repo.SETTINGS_KEY, next);
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'settings.update',
    entityType: 'AppSetting',
    entityId: repo.SETTINGS_KEY,
    after: next,
    requestId: audit.requestId,
  });
  return { defaults: next };
}

export async function listAdmins(prisma: PrismaClient, actor: Actor) {
  assertAdmin(actor);
  const rows = await repo.listAdmins(prisma);
  return {
    admins: rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      active: u.active,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
  };
}

export async function createAdmin(
  prisma: PrismaClient,
  actor: Actor,
  body: CreateAdminBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const existing = await findUserByEmail(prisma, body.email);
  if (existing !== null) {
    throw new AppError(ErrorCode.CONFLICT, 409, 'An admin with this email already exists');
  }
  const passwordHash = await hash(body.password, { type: 2 });
  const user = await createUser(prisma, {
    email: body.email,
    displayName: body.displayName,
    passwordHash,
  });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'admin.create',
    entityType: 'User',
    entityId: user.id,
    requestId: audit.requestId,
  });
  return {
    admin: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      active: user.active,
      lastLoginAt: null,
    },
  };
}

export async function patchAdmin(
  prisma: PrismaClient,
  actor: Actor,
  id: string,
  active: boolean,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  if (id === adminId && !active) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Cannot deactivate your own account');
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (user === null) throw new AppError(ErrorCode.NOT_FOUND, 404, 'Admin not found');
  const updated = await prisma.user.update({ where: { id }, data: { active } });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'admin.patch',
    entityType: 'User',
    entityId: id,
    after: { active },
    requestId: audit.requestId,
  });
  return {
    admin: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      active: updated.active,
      lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    },
  };
}

export async function changePassword(
  prisma: PrismaClient,
  actor: Actor,
  body: ChangePasswordBody,
  audit: { requestId: string },
) {
  const adminId = assertAdmin(actor);
  const user = await prisma.user.findUnique({ where: { id: adminId } });
  if (user === null) throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  const ok = await verify(user.passwordHash, body.currentPassword);
  if (!ok) throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Current password is incorrect');
  const passwordHash = await hash(body.newPassword, { type: 2 });
  await prisma.user.update({ where: { id: adminId }, data: { passwordHash } });
  await writeAudit(prisma, {
    actorUserId: adminId,
    action: 'admin.change_password',
    entityType: 'User',
    entityId: adminId,
    requestId: audit.requestId,
  });
  return { ok: true as const };
}
