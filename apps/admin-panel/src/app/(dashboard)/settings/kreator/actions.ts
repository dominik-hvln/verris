'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

/** Paczka 123 — Admin → Kreator stron. Kształty jak w apps/api/src/kreator/kreator.admin.controller.ts. */
export type BibliotekaZdjec = 'pixabay' | 'openverse' | 'pexels';

/** Paczka 124 – generowanie zdjęć AI (dostawca obrazów; włączać po publikacji zmiany Polityki prywatności). */
export type DostawcaObrazowAi = 'bfl' | 'openai';
export type KonfiguracjaObrazowAi = { wlaczone: boolean; dostawca: DostawcaObrazowAi; model: string; cenaZaObrazUsd: number };

export type KonfiguracjaKreatora = {
  modelGeneracji: string;
  modelZmian: string;
  wlaczony: boolean;
  kontaTestowe: string[];
  bibliotekiZdjec: BibliotekaZdjec[];
  obrazyAi: KonfiguracjaObrazowAi;
};

export type UstawieniaKreatora = {
  konfiguracja: KonfiguracjaKreatora;
  kluczAnthropic: boolean;
  regulamin: { wersja: string | null; wymieniaKreator: boolean };
  modele: { model: string; nazwa: string; cenaWej: number; cenaWyj: number; mnoznikOdczytuCache: number }[];
  mnoznikiZapisuCache: { '5m': number; '1h': number };
  konta: { wpis: string; email: string | null; istnieje: boolean }[];
  /** `gotowa` = klucz na serwerze (Openverse bez klucza); wartości klucza API nie zwraca. */
  biblioteki: { id: BibliotekaZdjec; nazwa: string; wymagaKlucza: boolean; gotowa: boolean }[];
  /** `klucz` = klucz dostawcy na serwerze (tak/nie) – wartości klucza API nie zwraca. */
  dostawcyObrazowAi: { id: DostawcaObrazowAi; nazwa: string; zmienna: string; klucz: boolean; modelDomyslny: string; cenaDomyslnaUsd: number }[];
  miesiac: { miesiac: string; generacje: number; zmiany: number; kosztUsd: number; cacheZapis: number; cacheOdczyt: number; obrazyAi: number };
};

export type PodsumowanieKreatora = {
  miesiac: string;
  konta: { zeStronami: number; aktywneWMiesiacu: number };
  strony: { razem: number; opublikowane: number; generowane: number; bledne: number };
  generacje: number;
  zmiany: number;
  koszt: {
    wywolania: number;
    tokeny: { wej: number; wyj: number; zapis5m: number; zapis1h: number; odczyt: number };
    wejscieUsd: number;
    wyjscieUsd: number;
    cacheZapisUsd: number;
    cacheOdczytUsd: number;
    razemUsd: number;
    bezCacheUsd: number;
    oszczednoscUsd: number;
    zapisanyUsd: number;
  };
  pro: { aktywne: number; miesieczne: number; roczne: number; miesiecznieBrutto: number; miesiecznieNetto: number };
  dni: { dzien: string; wywolania: number; generacje: number; zmiany: number; kosztUsd: number }[];
  magazyn: { zdjecia: number; bajty: number };
  /** Paczka 124 – zdjęcia AI w miesiącu: zlecenia, obrazy rozliczone przez dostawcę, dostarczone, odrzucone przez moderację. */
  obrazyAi?: { wywolania: number; obrazy: number; udane: number; moderowane: number; kosztUsd: number };
  bledy: { id: string; at: string; email: string; opis: string }[];
};

type Wynik<T> = { ok: true; dane: T } | { ok: false; error: string };

const komunikat = (e: unknown, domyslny: string) =>
  e instanceof AdminApiError || e instanceof Error ? e.message || domyslny : domyslny;

export async function fetchUstawieniaKreatora(): Promise<UstawieniaKreatora> {
  return adminApi<UstawieniaKreatora>('/admin/kreator/konfiguracja');
}

/** Błąd podsumowania nie wywraca strony – sekcja pokazuje „Nie udało się wczytać”. */
export async function fetchPodsumowanieKreatora(): Promise<PodsumowanieKreatora | null> {
  try {
    return await adminApi<PodsumowanieKreatora>('/admin/kreator/podsumowanie');
  } catch {
    return null;
  }
}

/** Zapis bez listy kont testowych – tę zmieniają osobne akcje (konto musi istnieć). */
export async function zapiszKreator(
  konf: Pick<KonfiguracjaKreatora, 'wlaczony' | 'modelGeneracji' | 'modelZmian' | 'bibliotekiZdjec' | 'obrazyAi'>,
): Promise<Wynik<UstawieniaKreatora>> {
  try {
    const body = {
      wlaczony: konf.wlaczony,
      modelGeneracji: konf.modelGeneracji,
      modelZmian: konf.modelZmian,
      bibliotekiZdjec: konf.bibliotekiZdjec,
      obrazyAi: konf.obrazyAi,
    };
    const dane = await adminApi<UstawieniaKreatora>('/admin/kreator/konfiguracja', { method: 'PUT', body });
    revalidatePath('/settings/kreator');
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się zapisać ustawień kreatora.') };
  }
}

export async function dodajKontoTestowe(email: string): Promise<Wynik<UstawieniaKreatora>> {
  try {
    const dane = await adminApi<UstawieniaKreatora>('/admin/kreator/konta-testowe', { method: 'POST', body: { email: email.trim() } });
    revalidatePath('/settings/kreator');
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się dodać konta testowego.') };
  }
}

export async function usunKontoTestowe(wpis: string): Promise<Wynik<UstawieniaKreatora>> {
  try {
    const dane = await adminApi<UstawieniaKreatora>(`/admin/kreator/konta-testowe/${encodeURIComponent(wpis)}`, { method: 'DELETE' });
    revalidatePath('/settings/kreator');
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się usunąć konta testowego.') };
  }
}
