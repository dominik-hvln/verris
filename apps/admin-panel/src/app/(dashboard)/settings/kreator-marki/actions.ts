'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

/** Paczka 130 — Admin → Kreator marki. Kształty jak w apps/api/src/kreator-marki/kreator-marki.admin.controller.ts. */
export type DostepnoscMarki = 'lista' | 'beta' | 'wszyscy';

export type KonfiguracjaMarki = {
  wlaczony: boolean;
  dostepnosc: DostepnoscMarki;
  kontaTestowe: string[];
  wCenieHostingu: { marek: number; seriiMies: number; zmianAiMies: number };
  pakiet: { cenaBrutto: number; serie: number; zmianyAi: number; aktualizacjeSzablonowMies: number };
  drugaMarka: { cenaBrutto: number };
  pakietWKreatorzeProRocznym: boolean;
  symboleAi: boolean;
  modelGeneracji: string;
  modelZmian: string;
  maksRozmiarWgraniaMb: number;
};

export type CenaBruttoNetto = { brutto: number; netto: number };

/** Faza 1: `zrodlo: 'brak-danych'` (tabele kreatora marki powstaną w fazie 2) – same zera. */
export type UzycieMarki = {
  miesiac: string;
  zrodlo: 'brak-danych' | 'baza';
  marki: number;
  kontaZMarka: number;
  serie: number;
  zmianyAi: number;
  kosztUsd: number;
  pakiety: number;
  drugieMarki: number;
};

export type UstawieniaMarki = {
  konfiguracja: KonfiguracjaMarki;
  /** Ceny z API – netto liczone z brutto (÷ 1,23, do grosza, jak na fakturze). */
  ceny: { pakiet: CenaBruttoNetto; drugaMarka: CenaBruttoNetto };
  kluczAnthropic: boolean;
  dokumenty: {
    regulamin: { wersja: string | null; wymieniaKreatorMarki: boolean };
    polityka: { wersja: string | null; wymieniaKreatorMarki: boolean };
  };
  modele: { model: string; nazwa: string; cenaWej: number; cenaWyj: number; mnoznikOdczytuCache: number }[];
  konta: { wpis: string; email: string | null; istnieje: boolean }[];
  uzycie: UzycieMarki;
};

/** Pola zapisywane przyciskiem „Zapisz” (lista kont testowych ma osobne akcje). */
export type ZmianyMarki = Omit<KonfiguracjaMarki, 'kontaTestowe'>;

type Wynik<T> = { ok: true; dane: T } | { ok: false; error: string };

const SCIEZKA = '/settings/kreator-marki';
const komunikat = (e: unknown, domyslny: string) => (e instanceof AdminApiError || e instanceof Error ? e.message || domyslny : domyslny);

export async function fetchUstawieniaMarki(): Promise<UstawieniaMarki> {
  return adminApi<UstawieniaMarki>('/admin/kreator-marki/konfiguracja');
}

export async function zapiszMarke(konf: ZmianyMarki): Promise<Wynik<UstawieniaMarki>> {
  try {
    const body: ZmianyMarki = {
      wlaczony: konf.wlaczony,
      dostepnosc: konf.dostepnosc,
      wCenieHostingu: konf.wCenieHostingu,
      pakiet: konf.pakiet,
      drugaMarka: konf.drugaMarka,
      pakietWKreatorzeProRocznym: konf.pakietWKreatorzeProRocznym,
      symboleAi: konf.symboleAi,
      modelGeneracji: konf.modelGeneracji,
      modelZmian: konf.modelZmian,
      maksRozmiarWgraniaMb: konf.maksRozmiarWgraniaMb,
    };
    const dane = await adminApi<UstawieniaMarki>('/admin/kreator-marki/konfiguracja', { method: 'PUT', body });
    revalidatePath(SCIEZKA);
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się zapisać ustawień Kreatora marki.') };
  }
}

export async function dodajKontoTestoweMarki(email: string): Promise<Wynik<UstawieniaMarki>> {
  try {
    const dane = await adminApi<UstawieniaMarki>('/admin/kreator-marki/konta-testowe', { method: 'POST', body: { email: email.trim() } });
    revalidatePath(SCIEZKA);
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się dodać konta testowego.') };
  }
}

export async function usunKontoTestoweMarki(wpis: string): Promise<Wynik<UstawieniaMarki>> {
  try {
    const dane = await adminApi<UstawieniaMarki>(`/admin/kreator-marki/konta-testowe/${encodeURIComponent(wpis)}`, { method: 'DELETE' });
    revalidatePath(SCIEZKA);
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się usunąć konta testowego.') };
  }
}
