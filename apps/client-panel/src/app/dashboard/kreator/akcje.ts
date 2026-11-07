'use server';

import { unstable_rethrow } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type {
  NowaStronaKreatora,
  PozycjaListyKreatora,
  StanKreatora,
  StanPublikacji,
  WersjaStronyKreatora,
  WidokStronyKreatora,
  WynikPublikacji,
} from '@/lib/kreator';

/**
 * Akcje serwera Verris Kreatora (wzorzec assistant-actions.ts: apiFetch z tokenem z ciasteczka + wynik zamiast
 * wyjątku). W odróżnieniu od `bezpiecznie` wynik błędu niesie też status HTTP i dane z treści odpowiedzi:
 * edytor rozróżnia 404 (publikacja jeszcze niedostępna w API), 409 KATALOG_ZAJETY (lista plików) i 400 z `bledy`.
 */
export type WynikKreatora<T> =
  | { ok: true; dane: T }
  | { ok: false; blad: string; status: number; kod?: string; pliki?: string[]; bledy?: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bladZApi(e: unknown): Extract<WynikKreatora<never>, { ok: false }> {
  if (e instanceof ApiError) {
    const tresc = (typeof e.body === 'object' && e.body !== null ? e.body : {}) as Record<string, unknown>;
    // Nest zagnieżdża obiekt wyjątku w `message`, gdy wyjątek dostał obiekt (np. { kod, pliki }).
    const wewn = (typeof tresc.message === 'object' && tresc.message !== null ? tresc.message : {}) as Record<string, unknown>;
    const pole = <K extends string>(k: K) => tresc[k] ?? wewn[k];
    const listaTekstow = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
    const kod = pole('kod');
    return {
      ok: false,
      blad: e.status === 0 ? e.message : e.message && !/^API \d+$/.test(e.message) ? e.message : 'Operacja nie powiodła się – spróbuj ponownie.',
      status: e.status,
      ...(typeof kod === 'string' ? { kod } : {}),
      ...(listaTekstow(pole('pliki')) ? { pliki: listaTekstow(pole('pliki')) } : {}),
      ...(listaTekstow(pole('bledy')) ? { bledy: listaTekstow(pole('bledy')) } : {}),
    };
  }
  return { ok: false, blad: e instanceof Error && e.message ? e.message : 'Operacja nie powiodła się – spróbuj ponownie.', status: 500 };
}

async function wynik<T>(fn: () => Promise<T>): Promise<WynikKreatora<T>> {
  try {
    return { ok: true, dane: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return bladZApi(e);
  }
}

function sprawdzId(id: string): void {
  if (!UUID.test(id)) throw new ApiError('Nie znaleziono strony.', 404, null);
}

/** Generacja i zmiana AI trwają dłużej niż domyślny budżet apiFetch (20 s); zmiana AI w API ma 90 s × 2 próby. */
const CZAS_ZMIANY_AI_MS = 200_000;

export async function stanKreatora(): Promise<WynikKreatora<StanKreatora>> {
  return wynik(() => apiFetch<StanKreatora>('/kreator/stan'));
}

export async function listaStron(): Promise<WynikKreatora<PozycjaListyKreatora[]>> {
  return wynik(() => apiFetch<PozycjaListyKreatora[]>('/kreator/strony'));
}

export async function pobierzStrone(id: string): Promise<WynikKreatora<WidokStronyKreatora>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokStronyKreatora>(`/kreator/strony/${id}`);
  });
}

/** Brief → nowa strona (202 z `id`); generacja idzie w tle, edytor odpytuje pobierzStrone. */
export async function utworzStrone(dane: NowaStronaKreatora): Promise<WynikKreatora<{ id: string }>> {
  return wynik(() => apiFetch<{ id: string }>('/kreator/strony', { method: 'POST', body: JSON.stringify(dane) }));
}

/** Zapis modelu z edytora (PUT). API sprawdza model tym samym walidatorem co edytor (walidujStrone). */
export async function zapiszModel(id: string, model: unknown): Promise<WynikKreatora<WidokStronyKreatora>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokStronyKreatora>(`/kreator/strony/${id}`, { method: 'PUT', body: JSON.stringify({ model }) });
  });
}

/**
 * Zmiana nazwy strony na liście (PATCH /kreator/strony/:id { nazwa } – 1–80 znaków, tylko własna strona).
 */
export async function zmienNazweStrony(id: string, nazwa: string): Promise<WynikKreatora<{ nazwa: string }>> {
  return wynik(async () => {
    sprawdzId(id);
    const czysta = nazwa.trim().slice(0, 80);
    if (!czysta) throw new ApiError('Nazwa strony nie może być pusta.', 400, null);
    const r = await apiFetch<{ nazwa?: string } | null>(`/kreator/strony/${id}`, { method: 'PATCH', body: JSON.stringify({ nazwa: czysta }) });
    return { nazwa: r?.nazwa ?? czysta };
  });
}

export async function polecenieAi(id: string, polecenie: string, sekcjaId: string | null): Promise<WynikKreatora<WidokStronyKreatora>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokStronyKreatora>(`/kreator/strony/${id}/ai`, {
      method: 'POST',
      body: JSON.stringify({ polecenie: polecenie.trim(), ...(sekcjaId ? { sekcjaId } : {}) }),
      timeoutMs: CZAS_ZMIANY_AI_MS,
    });
  });
}

export async function wersjeStrony(id: string): Promise<WynikKreatora<WersjaStronyKreatora[]>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WersjaStronyKreatora[]>(`/kreator/strony/${id}/wersje`);
  });
}

export async function przywrocWersje(id: string, numer: number): Promise<WynikKreatora<WidokStronyKreatora>> {
  return wynik(async () => {
    sprawdzId(id);
    if (!Number.isInteger(numer) || numer < 1) throw new ApiError('Nie ma takiej wersji.', 404, null);
    return apiFetch<WidokStronyKreatora>(`/kreator/strony/${id}/wersje/${numer}/przywroc`, { method: 'POST' });
  });
}

/** Kreator Pro: wybór propozycji projektu (1…n); dotychczasowy projekt wraca na jej miejsce. */
export async function wybierzPropozycje(id: string, n: number): Promise<WynikKreatora<WidokStronyKreatora>> {
  return wynik(async () => {
    sprawdzId(id);
    if (!Number.isInteger(n) || n < 1) throw new ApiError('Nie ma takiej propozycji.', 404, null);
    return apiFetch<WidokStronyKreatora>(`/kreator/strony/${id}/propozycja/${n}`, { method: 'POST' });
  });
}

export async function usunStrone(id: string): Promise<WynikKreatora<{ ok: true }>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<{ ok: true }>(`/kreator/strony/${id}`, { method: 'DELETE' });
  });
}

// ---------------------------------------------------------------------------
// Publikacja (kontrakt paczki 120 – endpointy może jeszcze nie mieć API; 404 = „wkrótce”)
// ---------------------------------------------------------------------------

export async function stanPublikacji(id: string): Promise<WynikKreatora<StanPublikacji>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<StanPublikacji>(`/kreator/strony/${id}/publikacja`);
  });
}

/** Publikacja: w próbie bez domeny (link podglądu), w hosting/Pro na domenę; 409 KATALOG_ZAJETY → `pliki`. */
export async function opublikuj(id: string, opcje: { domena?: string; zastap?: boolean }): Promise<WynikKreatora<WynikPublikacji>> {
  return wynik(async () => {
    sprawdzId(id);
    const body = { ...(opcje.domena ? { domena: opcje.domena } : {}), ...(opcje.zastap ? { zastap: true } : {}) };
    return apiFetch<WynikPublikacji>(`/kreator/strony/${id}/publikuj`, { method: 'POST', body: JSON.stringify(body), timeoutMs: 120_000 });
  });
}

export async function wycofajPublikacje(id: string): Promise<WynikKreatora<unknown>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<unknown>(`/kreator/strony/${id}/wycofaj`, { method: 'POST', timeoutMs: 120_000 });
  });
}
