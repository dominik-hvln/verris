'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type ApiTokenView = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
export type ScopeOption = { value: string; label: string };

function err(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Wystąpił błąd.';
}

export async function fetchScopes(): Promise<ScopeOption[]> {
  return apiFetch<ScopeOption[]>('/users/me/api-tokens/scopes');
}
export async function fetchTokens(): Promise<ApiTokenView[]> {
  return apiFetch<ApiTokenView[]>('/users/me/api-tokens');
}
export async function createTokenAction(input: {
  name: string;
  scopes: string[];
  expiresInDays?: number | null;
}): Promise<{ ok: true; token: string; view: ApiTokenView } | { ok: false; error: string }> {
  try {
    const r = await apiFetch<{ token: string; view: ApiTokenView }>('/users/me/api-tokens', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { ok: true, token: r.token, view: r.view };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function revokeTokenAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch(`/users/me/api-tokens/${id}`, { method: 'DELETE' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
