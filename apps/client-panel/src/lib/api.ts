import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface ApiOptions extends RequestInit {
  /** Skip the cookie-based JWT (e.g. for public endpoints). */
  unauthenticated?: boolean;
}

/**
 * Server-side fetch wrapper. Reads the `auth_token` cookie and attaches it
 * as a Bearer token. Returns parsed JSON, or throws an `ApiError` on 4xx/5xx.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { unauthenticated, headers: extraHeaders, ...rest } = options;

  const headers = new Headers(extraHeaders);
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (!unauthenticated) {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    cache: 'no-store',
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    let message: string | null = null;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const m = (body as { message?: unknown }).message;
      if (typeof m === 'object' && m !== null && 'message' in m) {
        const inner = (m as { message?: unknown }).message;
        if (Array.isArray(inner)) {
          message = inner.filter((x): x is string => typeof x === 'string').join(', ');
        } else if (typeof inner === 'string') {
          message = inner;
        }
      } else if (Array.isArray(m)) {
        message = m.filter((x): x is string => typeof x === 'string').join(', ');
      } else if (typeof m === 'string') {
        message = m;
      }
    }
    if (message === null && typeof body === 'string' && body.length > 0) {
      message = body;
    }
    throw new ApiError(message ?? `API ${response.status}`, response.status, body);
  }
  return body as T;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
