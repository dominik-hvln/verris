'use server';

import { unstable_rethrow } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { StanPrzejsciaCms, WidokCms, WynikPodgladu } from './typy';

/** Wynik akcji serwera bez wyjątku (jak akcje kreatora): błąd = komunikat z API po polsku. */
export type WynikCms<T> = { ok: true; dane: T } | { ok: false; blad: string; status: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Instalacja podglądu buduje paczkę (zdjęcia, fonty) i zakłada bazę – dłużej niż domyślny budżet apiFetch. */
const CZAS_PODGLADU_MS = 180_000;

async function wynik<T>(fn: () => Promise<T>): Promise<WynikCms<T>> {
  try {
    return { ok: true, dane: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError) {
      const komunikat = e.status === 0 ? e.message : e.message && !/^API \d+$/.test(e.message) ? e.message : 'Operacja nie powiodła się – spróbuj ponownie.';
      return { ok: false, blad: komunikat, status: e.status };
    }
    return { ok: false, blad: 'Operacja nie powiodła się – spróbuj ponownie.', status: 500 };
  }
}

function sprawdzId(id: string): void {
  if (!UUID.test(id)) throw new ApiError('Nie znaleziono strony.', 404, null);
}

export async function stanCms(id: string): Promise<WynikCms<StanPrzejsciaCms>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<StanPrzejsciaCms>(`/kreator/strony/${id}/cms`);
  });
}

export async function zainstalujPodgladWordpress(id: string, domena: string): Promise<WynikCms<WynikPodgladu>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WynikPodgladu>(`/kreator/strony/${id}/cms/wordpress`, { method: 'POST', body: JSON.stringify({ domena, tryb: 'podglad' }), timeoutMs: CZAS_PODGLADU_MS });
  });
}

export async function zamienNaWordpress(id: string, domena: string): Promise<WynikCms<WidokCms>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokCms>(`/kreator/strony/${id}/cms/wordpress`, { method: 'POST', body: JSON.stringify({ domena, tryb: 'zamiana' }) });
  });
}

export async function cofnijWordpress(id: string): Promise<WynikCms<WidokCms>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokCms>(`/kreator/strony/${id}/cms/wordpress/cofnij`, { method: 'POST' });
  });
}
