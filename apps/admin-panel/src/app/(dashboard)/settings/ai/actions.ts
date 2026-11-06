'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type DostawcaAi = 'openai' | 'anthropic';
export type KonfiguracjaAi = {
  szybki: { dostawca: DostawcaAi; model: string };
  analiza: { dostawca: DostawcaAi; model: string };
  limitKlientaUsd: number;
  limitPlatformyUsd: number;
  ceny: Record<string, { wej: number; wyj: number }>;
  /** Decyzja 5: asystent AI dla wszystkich klientów (znosi listę kont testowych AI_TYLKO_KONTA z env). */
  dlaWszystkichKlientow: boolean;
};
export type UstawieniaAi = {
  konfiguracja: KonfiguracjaAi;
  znaneModele: { dostawca: DostawcaAi; model: string; nazwa: string; cenaWej: number; cenaWyj: number }[];
  klucze: Record<DostawcaAi, boolean>;
  /** Liczba kont na liście testowej z env; 0 = AI i tak dla wszystkich. */
  kontaTestowe: number;
};
export type KosztyAi = {
  limitKlientaUsd: number;
  limitPlatformyUsd: number;
  miesiacUsd: number;
  prognozaMiesiacaUsd: number;
  ostatnie30Dni: {
    funkcja: string;
    poziom: 'szybki' | 'analiza';
    model: string;
    wywolania: number;
    tokenyWej: number;
    tokenyWyj: number;
    kosztUsd: number;
  }[];
  klienci: { userId: string; email: string; wywolania: number; kosztUsd: number }[];
};

export async function fetchUstawieniaAi(): Promise<UstawieniaAi> {
  return adminApi<UstawieniaAi>('/admin/ai/ustawienia');
}

export async function fetchKosztyAi(): Promise<KosztyAi | null> {
  try {
    return await adminApi<KosztyAi>('/admin/ai/koszty');
  } catch {
    return null;
  }
}

export async function zapiszUstawieniaAi(
  konf: KonfiguracjaAi,
): Promise<{ ok: true; ustawienia: UstawieniaAi } | { ok: false; error: string }> {
  try {
    const ustawienia = await adminApi<UstawieniaAi>('/admin/ai/ustawienia', { method: 'PATCH', body: konf });
    revalidatePath('/settings/ai');
    return { ok: true, ustawienia };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError || e instanceof Error ? e.message : 'Nie udało się zapisać ustawień AI.',
    };
  }
}

/** 1.11 — asystent AI na verris.pl (ustawienie `ai.asystentWww`). Działa tylko na modelach Anthropic. */
export type KonfiguracjaAsystentaWww = {
  wlaczony: boolean;
  model: string;
  modelStraznika: string;
  /** USD; 0 = bez limitu. */
  limitDziennyUsd: number;
  limitMiesiecznyUsd: number;
};
export type AsystentWww = {
  konfiguracja: KonfiguracjaAsystentaWww;
  kluczAnthropic: boolean;
  dzisUsd: number;
  miesiacUsd: number;
};

const komunikat = (e: unknown, domyslny: string) =>
  e instanceof AdminApiError || e instanceof Error ? e.message || domyslny : domyslny;

/** Błąd odczytu nie wywraca strony ustawień AI — sekcja pokazuje komunikat. */
export async function fetchAsystentWww(): Promise<{ ok: true; dane: AsystentWww } | { ok: false; error: string }> {
  try {
    return { ok: true, dane: await adminApi<AsystentWww>('/admin/ai/asystent-www') };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się wczytać ustawień asystenta na verris.pl.') };
  }
}

export async function zapiszAsystentaWww(
  konf: KonfiguracjaAsystentaWww,
): Promise<{ ok: true; dane: AsystentWww } | { ok: false; error: string }> {
  try {
    // Tylko pola z DTO (UstawieniaAsystentaWwwDto) — nic ponad nie trafia do API.
    const body: KonfiguracjaAsystentaWww = {
      wlaczony: konf.wlaczony,
      model: konf.model,
      modelStraznika: konf.modelStraznika,
      limitDziennyUsd: konf.limitDziennyUsd,
      limitMiesiecznyUsd: konf.limitMiesiecznyUsd,
    };
    const dane = await adminApi<AsystentWww>('/admin/ai/asystent-www', { method: 'PATCH', body });
    revalidatePath('/settings/ai');
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: komunikat(e, 'Nie udało się zapisać ustawień asystenta na verris.pl.') };
  }
}
