import { cookies } from 'next/headers';
import type { z } from 'zod';

function apiBaseUrl(): string {
  return process.env['API_URL'] ?? 'http://127.0.0.1:3001';
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const headers = new Headers(init?.headers);
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (cookieHeader !== '') headers.set('cookie', cookieHeader);
  return fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${String(res.status)}`);
  }
  const raw: unknown = await res.json();
  return schema.parse(raw);
}
