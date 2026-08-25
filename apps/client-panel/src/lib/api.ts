import { cookies, headers as incomingHeaders } from 'next/headers';

// PRZEGLĄDARKA I SERWER TO DWA RÓŻNE ADRESY TEGO SAMEGO API.
//
// `NEXT_PUBLIC_API_URL` jest adresem PUBLICZNYM (https://api.verris.pl) i ma
// sens wyłącznie w kodzie, który wykonuje przeglądarka klienta. Ten moduł
// działa po stronie SERWERA (RSC, server actions) — stamtąd do API jest bliżej
// niż przez internet: sieć Dockera, `http://api:3000`. Compose podaje ten
// adres kontenerowi w zmiennej `API_URL` (docker-compose.prod.yml).
//
// X-37. Do 2026-08-25 stała była tu tylko zmienna publiczna, więc każdy fetch
// z kontenera `client-panel` szedł na publiczny adres własnego hosta i próbował
// wrócić do środka (hairpin NAT). Ta pętla się nie domykała: undici czekał
// swoje domyślne 10 s na połączenie i rzucał `TypeError: fetch failed`.
// Zmierzone z wnętrza kontenera:
//
//     base = https://api.verris.pl
//       10563ms  /healthz -> UND_ERR_CONNECT_TIMEOUT
//
// Objawy dla klienta: logowanie trwało wielokrotność 10 s i często nie
// dochodziło do skutku, a dashboard pokazywał „Usługi: fetch failed / Domeny:
// fetch failed"; pozostałe kafelki wracały ciche i puste, bo w
// `dashboard-data.ts` mają `.catch(() => null)`. Panel admina działał, bo
// `staff-api.ts` czytał `API_URL` od początku. Nawigacja panelu klienta też
// się pojawiała, bo `session-profile.ts` również czytał `API_URL` — awarii nie
// było widać w jednym miejscu, tylko w tych, które ominął ten sam nawyk.
//
// KOLEJNOŚĆ MA ZNACZENIE: `API_URL` przed publiczną. Odwrotnie zmienna
// wewnętrzna nigdy by nie zadziałała, bo publiczna jest zawsze ustawiona.
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

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

  // Pre-LIVE: forward the real client IP (set by Caddy on the incoming
  // request). Without this every panel user reaches the API from the panel
  // container's IP — breaking per-IP rate limits, lockouts and audit logs.
  try {
    const incoming = await incomingHeaders();
    const xff = incoming.get('x-forwarded-for');
    if (xff && !headers.has('x-forwarded-for')) headers.set('x-forwarded-for', xff);
  } catch {
    /* outside request scope (build/ISR) — skip */
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
