'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** J-06 — bezstratna optymalizacja obrazów strony (zadanie węzła). */
export interface StanObrazow {
  domena: string;
  wToku: boolean;
  ostatni: { plikow: number; przed: number; po: number; zostalo: number; katalog: string; kiedy: string } | null;
  blad: string | null;
}

type Wynik = { ok: true; stan: StanObrazow } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchObrazy(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return { ok: true, stan: await apiFetch<StanObrazow>(`/services/${serviceId}/hosting-images?domain=${encodeURIComponent(domain)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function optymalizujObrazy(serviceId: string, domain: string, katalog: string, metadane: boolean): Promise<Wynik> {
  try {
    return {
      ok: true,
      stan: await apiFetch<StanObrazow>(`/services/${serviceId}/hosting-images`, { method: 'POST', body: JSON.stringify({ domain, katalog, metadane }) }),
    };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
