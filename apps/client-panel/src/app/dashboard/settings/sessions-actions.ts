'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface SessionEntry {
  id: string;
  ipAddress: string | null;
  deviceLabel: string | null;
  loginMethod: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** SEC-10 — lista aktywnych sesji (urządzeń) konta. */
export async function fetchSessions(): Promise<SessionEntry[]> {
  try {
    const res = await apiFetch<{ sessions: SessionEntry[] }>('/auth/sessions');
    return res.sessions ?? [];
  } catch {
    return [];
  }
}

/** SEC-10 — zdalne wylogowanie pojedynczej sesji. */
export async function revokeSession(id: string) {
  try {
    await apiFetch(`/auth/sessions/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
    return { success: true as const };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: 'Błąd połączenia z serwerem' };
  }
}
