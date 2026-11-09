'use server';

import { unstable_rethrow } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { DostawcaZdjec, ListaZasobow, OdpowiedzBiblioteki, ProporcjeObrazu, StanGenerowania, WynikGenerowania, ZasobKreatora } from './typy';

/**
 * Paczka 122 – akcje serwera biblioteki zdjęć kreatora (apiFetch z tokenem z ciasteczka, wynik zamiast wyjątku).
 * Wgrywanie pliku idzie trasą /api/kreator/zasoby (strumień multipart z postępem), nie akcją serwera.
 */
export type WynikZdjec<T> = { ok: true; dane: T } | { ok: false; blad: string; status: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function wynik<T>(fn: () => Promise<T>): Promise<WynikZdjec<T>> {
  try {
    return { ok: true, dane: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError) {
      return { ok: false, blad: e.message && !/^API \d+$/.test(e.message) ? e.message : 'Operacja nie powiodła się – spróbuj ponownie.', status: e.status };
    }
    return { ok: false, blad: 'Operacja nie powiodła się – spróbuj ponownie.', status: 500 };
  }
}

export async function listaZasobow(strona = 1): Promise<WynikZdjec<ListaZasobow>> {
  const s = Math.max(1, Math.min(1000, Math.floor(strona) || 1));
  return wynik(() => apiFetch<ListaZasobow>(`/kreator/zasoby?strona=${s}`));
}

export async function szukajZdjec(p: { q: string; dostawca?: DostawcaZdjec; strona?: number }): Promise<WynikZdjec<OdpowiedzBiblioteki>> {
  const q = new URLSearchParams();
  if (p.q.trim()) q.set('q', p.q.trim().slice(0, 100));
  if (p.dostawca) q.set('dostawca', p.dostawca);
  if (p.strona && p.strona > 1) q.set('strona', String(Math.min(20, Math.floor(p.strona))));
  return wynik(() => apiFetch<OdpowiedzBiblioteki>(`/kreator/biblioteka${q.size ? `?${q.toString()}` : ''}`));
}

/** Import trwa dłużej niż domyślny budżet apiFetch (pobranie od dostawcy + przetworzenie wariantów). */
const CZAS_IMPORTU_MS = 90_000;

export async function importujZdjecie(p: { dostawca: DostawcaZdjec; id: string; stronaId?: string }): Promise<WynikZdjec<{ zasob: ZasobKreatora }>> {
  return wynik(() =>
    apiFetch<{ zasob: ZasobKreatora }>('/kreator/biblioteka/import', {
      method: 'POST',
      body: JSON.stringify({ dostawca: p.dostawca, id: p.id, ...(p.stronaId && UUID.test(p.stronaId) ? { stronaId: p.stronaId } : {}) }),
      timeoutMs: CZAS_IMPORTU_MS,
    }),
  );
}

export async function usunZasob(id: string): Promise<WynikZdjec<{ ok: true }>> {
  return wynik(async () => {
    if (!UUID.test(id)) throw new ApiError('Nie znaleziono zdjęcia.', 404, null);
    return apiFetch<{ ok: true }>(`/kreator/zasoby/${id}`, { method: 'DELETE' });
  });
}

/** Adresy bazowe plików zdjęć (…/kreator/z/<token>/) – miniatura w polu obrazu formularza. */
export async function adresyZasobow(ids: string[]): Promise<WynikZdjec<{ adresy: Record<string, string> }>> {
  const czyste = [...new Set(ids.filter((i) => UUID.test(i)))].slice(0, 100);
  if (!czyste.length) return { ok: true, dane: { adresy: {} } };
  return wynik(() => apiFetch<{ adresy: Record<string, string> }>(`/kreator/zasoby/adresy?ids=${czyste.join(',')}`));
}

/** Paczka 124 – czy generowanie zdjęć AI działa i ile zdjęć zostało w miesiącu. */
export async function stanGenerowania(): Promise<WynikZdjec<StanGenerowania>> {
  return wynik(() => apiFetch<StanGenerowania>('/kreator/zasoby/generuj', { timeoutMs: 10_000 }));
}

/** Generowanie trwa: prompt (do 30 s) + dostawca obrazów (do 90 s) + zapis wariantów – zapas ponad limit API. */
const CZAS_GENEROWANIA_MS = 150_000;

export async function generujZdjecie(p: { opis: string; stronaId: string; proporcje: ProporcjeObrazu; sciezkaObrazu?: string }): Promise<WynikZdjec<WynikGenerowania>> {
  return wynik(async () => {
    if (!UUID.test(p.stronaId)) throw new ApiError('Nie znaleziono strony.', 404, null);
    return apiFetch<WynikGenerowania>('/kreator/zasoby/generuj', {
      method: 'POST',
      body: JSON.stringify({
        opis: p.opis.trim().slice(0, 400),
        stronaId: p.stronaId,
        proporcje: p.proporcje,
        ...(p.sciezkaObrazu && /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+){0,12}$/.test(p.sciezkaObrazu) ? { sciezkaObrazu: p.sciezkaObrazu } : {}),
      }),
      timeoutMs: CZAS_GENEROWANIA_MS,
    });
  });
}
