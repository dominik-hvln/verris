'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** K-14 — wolne zapytania SQL baz konta (znormalizowane, bez wartości). */
export interface WolneZapytania {
  wToku: boolean;
  odczytano: string | null;
  wlaczony: boolean | null;
  progSekund: number | null;
  grupy: { sql: string; baza: string; liczba: number; suma: number; max: number; przejrzane: number; ostatnio: string | null }[];
  blad: string | null;
}

type Wynik = { ok: true; stan: WolneZapytania } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchWolneZapytania(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, stan: await apiFetch<WolneZapytania>(`/services/${serviceId}/hosting-slow-sql`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function odswiezWolneZapytania(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, stan: await apiFetch<WolneZapytania>(`/services/${serviceId}/hosting-slow-sql`, { method: 'POST' }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
