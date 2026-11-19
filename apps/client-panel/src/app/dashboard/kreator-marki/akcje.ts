'use server';

import { unstable_rethrow } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type {
  BriefMarki,
  DaneKontaktoweMarki,
  DrobnaZmianaBody,
  PlikMarki,
  ProjektLogo,
  StanKreatoraMarki,
  StopkaEmailWynik,
  UstawieniaKv,
  WidokMarki,
  WybierzBody,
  WynikZakupuMarki,
  ZgodyBody,
} from '@verris/kreator/klient';

/**
 * Paczka 131 – akcje serwera Kreatora marki (kontrakt HTTP: libs/kreator/src/marka/api-kontrakt.ts). Wzorzec kreatora
 * stron (kreator/akcje.ts): apiFetch z tokenem z ciasteczka i wynik zamiast wyjątku – ekrany rozróżniają 403
 * MODUL_NIEDOSTEPNY, 402 (Pakiet / okres próbny), 409 PODOBNY_ZNAK i 400 z listą `bledy` (np. brief z nazwą znanej
 * marki). Pliki (pobieranie, ZIP, podglądy materiałów, wgrywanie logo) idą trasami app/api/kreator-marki/**, nie tędy.
 */
export type WynikMarki<T> =
  | { ok: true; dane: T }
  | { ok: false; blad: string; status: number; kod?: string; bledy?: string[] };

/** Identyfikator marki z API (uuid/cuid) – nic innego nie trafia do ścieżki zapytania. */
const ID_MARKI = /^[A-Za-z0-9_-]{1,64}$/;

const DOMYSLNY_BLAD = 'Operacja nie powiodła się – spróbuj ponownie.';

function bladZApi(e: unknown): Extract<WynikMarki<never>, { ok: false }> {
  if (e instanceof ApiError) {
    const tresc = (typeof e.body === 'object' && e.body !== null ? e.body : {}) as Record<string, unknown>;
    // Nest zagnieżdża obiekt wyjątku w `message`, gdy wyjątek dostał obiekt (np. { message, kod, bledy }).
    const wewn = (typeof tresc.message === 'object' && tresc.message !== null ? tresc.message : {}) as Record<string, unknown>;
    const pole = (k: string) => tresc[k] ?? wewn[k];
    const kod = pole('kod');
    const bledy = pole('bledy');
    const lista = Array.isArray(bledy) ? bledy.filter((x): x is string => typeof x === 'string') : undefined;
    return {
      ok: false,
      blad: e.status === 0 ? e.message : e.message && !/^API \d+$/.test(e.message) ? e.message : DOMYSLNY_BLAD,
      status: e.status,
      ...(typeof kod === 'string' ? { kod } : {}),
      ...(lista?.length ? { bledy: lista } : {}),
    };
  }
  return { ok: false, blad: e instanceof Error && e.message ? e.message : DOMYSLNY_BLAD, status: 500 };
}

async function wynik<T>(fn: () => Promise<T>): Promise<WynikMarki<T>> {
  try {
    return { ok: true, dane: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return bladZApi(e);
  }
}

function sprawdzId(id: string): void {
  if (!ID_MARKI.test(id)) throw new ApiError('Nie znaleziono marki.', 404, null);
}

const json = (dane: unknown) => JSON.stringify(dane);

/** Seria propozycji, odświeżenie i KV od AI: model + walidacja + jedna runda naprawy – dłużej niż domyślne 20 s. */
const CZAS_AI_MS = 200_000;
/** Drobna zmiana (hasło, opis) – tańszy model, krótkie wyjście. */
const CZAS_ZMIANY_MS = 90_000;

export async function stanKreatoraMarki(): Promise<WynikMarki<StanKreatoraMarki>> {
  return wynik(() => apiFetch<StanKreatoraMarki>('/kreator-marki/stan'));
}

/** Brief → szkic marki (limit marek). Seria propozycji to osobne wywołanie (`nowaSeria`). */
export async function utworzMarke(brief: BriefMarki): Promise<WynikMarki<WidokMarki>> {
  return wynik(() => apiFetch<WidokMarki>('/kreator-marki/marki', { method: 'POST', body: json({ zrodlo: 'nowa', brief }) }));
}

export async function pobierzMarke(id: string): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}`);
  });
}

export async function zmienBrief(id: string, brief: BriefMarki): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/brief`, { method: 'PATCH', body: json(brief) });
  });
}

/** Nowa seria 6 kierunków (AI, limit serii). */
export async function nowaSeria(id: string): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/serie`, { method: 'POST', timeoutMs: CZAS_AI_MS });
  });
}

/** Trzy kierunki odświeżenia wgranego logo (AI, limit serii). */
export async function kierunkiOdswiezenia(id: string): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/odswiezenie`, { method: 'POST', timeoutMs: CZAS_AI_MS });
  });
}

/** Wybór kierunku (z ewentualną edycją z „Dopasuj”); 409 PODOBNY_ZNAK = znak bardzo podobny do logo, które już powstało w kreatorze. */
export async function wybierzKierunek(id: string, body: WybierzBody): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/wybierz`, { method: 'POST', body: json(body) });
  });
}

/** Zapis „Dopasuj” (bez AI, limit nie spada); API ocenia projekt regułami. */
export async function zapiszProjekt(id: string, projekt: ProjektLogo): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/projekt`, { method: 'PUT', body: json({ projekt }) });
  });
}

export async function zapiszKv(id: string, kv: UstawieniaKv): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/kv`, { method: 'PUT', body: json(kv) });
  });
}

export async function zapiszKontakt(id: string, kontakt: DaneKontaktoweMarki): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/kontakt`, { method: 'PUT', body: json(kontakt) });
  });
}

/** Drobna zmiana AI (np. „Zaproponuj hasło”) – limit zmian AI. */
export async function drobnaZmiana(id: string, body: DrobnaZmianaBody): Promise<WynikMarki<{ wynik: Record<string, string>; widok: WidokMarki }>> {
  return wynik(async () => {
    sprawdzId(id);
    const polecenie = body.polecenie?.trim().slice(0, 300);
    return apiFetch<{ wynik: Record<string, string>; widok: WidokMarki }>(`/kreator-marki/marki/${id}/ai`, {
      method: 'POST',
      body: json({ rodzaj: body.rodzaj, ...(polecenie ? { polecenie } : {}) }),
      timeoutMs: CZAS_ZMIANY_MS,
    });
  });
}

/** Key Visual pod wgrane logo (logo bez zmian) – propozycja palety, wzoru i hasła od AI. */
export async function kvPodWgraneLogo(id: string, polecenie?: string): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    const p = polecenie?.trim().slice(0, 300);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/kv-ai`, { method: 'POST', body: json(p ? { polecenie: p } : {}), timeoutMs: CZAS_AI_MS });
  });
}

export async function zapiszZgody(id: string, zgody: ZgodyBody): Promise<WynikMarki<WidokMarki>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<WidokMarki>(`/kreator-marki/marki/${id}/zgody`, { method: 'POST', body: json(zgody) });
  });
}

export async function listaPlikow(id: string): Promise<WynikMarki<PlikMarki[]>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<PlikMarki[]>(`/kreator-marki/marki/${id}/pliki`);
  });
}

export async function stopkaEmail(id: string): Promise<WynikMarki<StopkaEmailWynik>> {
  return wynik(async () => {
    sprawdzId(id);
    return apiFetch<StopkaEmailWynik>(`/kreator-marki/marki/${id}/stopka-email`, { method: 'POST', timeoutMs: 60_000 });
  });
}

export async function usunMarke(id: string): Promise<WynikMarki<{ ok: true }>> {
  return wynik(async () => {
    sprawdzId(id);
    await apiFetch<unknown>(`/kreator-marki/marki/${id}`, { method: 'DELETE' });
    return { ok: true as const };
  });
}

const METODY = ['portfel', 'karta', 'paynow'] as const;

/** Pakiet marki albo kolejna marka – zgoda na treść cyfrową obowiązkowa (bez niej nie wysyłamy zamówienia). */
export async function kupMarke(
  rodzaj: 'pakiet' | 'druga-marka',
  metoda: (typeof METODY)[number],
  zgodaTresciCyfrowej: boolean,
): Promise<WynikMarki<WynikZakupuMarki>> {
  return wynik(async () => {
    if (rodzaj !== 'pakiet' && rodzaj !== 'druga-marka') throw new ApiError('Nieznany zakup.', 400, null);
    if (!(METODY as readonly string[]).includes(metoda)) throw new ApiError('Wybierz metodę płatności.', 400, null);
    if (zgodaTresciCyfrowej !== true) throw new ApiError('Zaznacz zgodę na rozpoczęcie dostarczania treści cyfrowej.', 400, null);
    const opcje = { method: 'POST', body: json({ metoda, zgodaTresciCyfrowej: true }), timeoutMs: 60_000 };
    // Dosłowne ścieżki (strażnik ui-routes-coverage dopasowuje wywołania panelu do tras API).
    return rodzaj === 'pakiet'
      ? apiFetch<WynikZakupuMarki>('/kreator-marki/pakiet', opcje)
      : apiFetch<WynikZakupuMarki>('/kreator-marki/druga-marka', opcje);
  });
}
