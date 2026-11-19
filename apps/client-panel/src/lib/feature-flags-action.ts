'use server';

import { apiFetch } from '@/lib/api';

/**
 * N-12 — mapa flag ocenionych dla klienta; błąd = pusta mapa (moduły jak dotąd).
 * Paczka 131 – zawiera też `kreatorMarki` (Kreator marki dostępny dla konta – API, me-feature-flags.controller.ts);
 * brak flagi = pozycja menu ukryta (feature-flags-core.ts `trasaWidoczna`).
 */
export async function pobierzFlagiAction(): Promise<Record<string, boolean>> {
  try {
    return await apiFetch<Record<string, boolean>>('/me/feature-flags');
  } catch {
    return {};
  }
}
