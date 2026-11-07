import { createHash, randomBytes } from 'node:crypto';

const SESSION_DAYS = 30;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function sessionExpiresAt(from = new Date()): Date {
  const ms = SESSION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}
