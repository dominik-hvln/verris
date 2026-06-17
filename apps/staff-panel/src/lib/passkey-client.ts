'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function extractMsg(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.filter((x): x is string => typeof x === 'string').join(', ');
  }
  return null;
}

export async function fetchPasskeyLoginOptions(): Promise<unknown> {
  const res = await fetch(`${API_URL}/auth/webauthn/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractMsg(body) ?? `HTTP ${res.status}`);
  return body;
}

export async function verifyPasskeyLoginClient(response: unknown): Promise<{
  access_token: string;
  user?: { role?: string };
}> {
  const res = await fetch(`${API_URL}/auth/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    user?: { role?: string };
  } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(extractMsg(body) ?? 'Logowanie passkey nie powiodło się.');
  }
  return { access_token: body.access_token, user: body.user };
}
