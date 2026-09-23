'use server';

import { apiFetch } from '@/lib/api';

/** N-12 — mapa flag ocenionych dla klienta; błąd = pusta mapa (moduły jak dotąd). */
export async function pobierzFlagiAction(): Promise<Record<string, boolean>> {
  try {
    return await apiFetch<Record<string, boolean>>('/me/feature-flags');
  } catch {
    return {};
  }
}
