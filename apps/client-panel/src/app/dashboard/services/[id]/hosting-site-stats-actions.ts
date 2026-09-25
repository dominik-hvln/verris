'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** PB-19 — technologia, ruch 7 dni, błędy 5xx i TTFB strony (zadanie węzła). */
export interface StatystykiStrony {
  domena: string;
  wToku: boolean;
  odczytano: string | null;
  statystyki: {
    technologia: { nazwa: string; wersja: string | null };
    ruch: { dzien: string; zadania: number; odwiedzajacy: number; bledy5xx: number }[];
    top5xx: { sciezka: string; liczba: number }[];
    ttfbMs: { mediana: number; probki: number } | null;
    log: boolean;
  } | null;
  blad: string | null;
}

type Wynik = { ok: true; stan: StatystykiStrony } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchStatystykiStrony(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return { ok: true, stan: await apiFetch<StatystykiStrony>(`/services/${serviceId}/hosting-site-stats?domain=${encodeURIComponent(domain)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function odswiezStatystykiStrony(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return {
      ok: true,
      stan: await apiFetch<StatystykiStrony>(`/services/${serviceId}/hosting-site-stats`, { method: 'POST', body: JSON.stringify({ domain }) }),
    };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
