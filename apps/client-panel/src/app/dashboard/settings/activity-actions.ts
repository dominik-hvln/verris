'use server';

import { apiFetch } from '@/lib/api';

export interface AccountActivityEntry {
  id: string;
  action: string;
  at: string;
  context: string | null;
}

/** SEC-8 — dziennik aktywności konta zalogowanego użytkownika. */
export async function fetchAccountActivity(): Promise<AccountActivityEntry[]> {
  try {
    const res = await apiFetch<{ events: AccountActivityEntry[] }>('/users/me/activity');
    return res.events ?? [];
  } catch {
    return [];
  }
}
