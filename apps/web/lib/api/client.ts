import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  type ApiErrorBody,
  type ErrorCode,
  type LoginBody,
} from '@pbl/shared';
import { messageForErrorCode } from '@/messages';

export function csrfMutationHeaders(): Record<string, string> {
  return { [CSRF_HEADER]: CSRF_HEADER_VALUE };
}

export async function readApiError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    return messageForErrorCode(data.error.code);
  } catch {
    return messageForErrorCode('INTERNAL_ERROR' satisfies ErrorCode);
  }
}

export async function clientJson(
  path: string,
  init: RequestInit,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const res = await clientFetch(path, init);
  if (res.ok) {
    const data: unknown = await res.json();
    return { ok: true, data };
  }
  return { ok: false, message: await readApiError(res) };
}

export async function clientFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type') && init?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });
}

export async function loginRequest(
  body: LoginBody,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await clientFetch('/api/auth/login', {
    method: 'POST',
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json()) as ApiErrorBody;
  return { ok: false, message: data.error.message };
}

export async function logoutRequest(): Promise<void> {
  await clientFetch('/api/auth/logout', {
    method: 'POST',
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
  });
}
