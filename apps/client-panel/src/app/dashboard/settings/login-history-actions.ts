'use server';

import { apiFetch } from '@/lib/api';

export interface LoginHistoryEntry {
  id: string;
  at: string;
  ipAddress: string | null;
  device: string | null;
  countryCode: string | null;
  isNewDevice: boolean;
  loginMethod: string;
}

/** SEC-7 — ostatnie logowania zalogowanego użytkownika. */
export async function fetchLoginHistory(): Promise<LoginHistoryEntry[]> {
  try {
    const res = await apiFetch<{ events: LoginHistoryEntry[] }>('/users/me/login-history');
    return res.events ?? [];
  } catch {
    return [];
  }
}
