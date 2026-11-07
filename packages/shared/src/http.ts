/** CSRF / mutation guard (ADR-005, ARCHITECTURE §6). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'pbl';

export const SESSION_COOKIE_NAME = 'pbl_session';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
