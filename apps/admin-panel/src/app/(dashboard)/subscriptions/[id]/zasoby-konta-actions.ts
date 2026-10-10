"use server";

import { adminApi, AdminApiError } from "@/lib/api";
import type { Faulty } from "@/components/faulty-limitow";

/**
 * F2.6 — „Zasoby i diagnoza 508” na karcie usługi (apps/api/src/subscriptions/konto-klienta.admin.controller.ts,
 * GET/POST admin/subscriptions/:id/konto/zasoby, ACCOUNT_DIAGNOSTICS_VIEW). Jedna stała ścieżka — przeglądarka nie
 * poda dowolnej trasy API.
 */
export type ZasobyKonta = {
  login: string;
  domena: string | null;
  limity: { cpuProcent: number; ep: number; nproc: number; ramMb: number; ioKbps: number; iops: number };
  faulty: { odczytano: string | null; nieaktualne: boolean; blad: string | null; doba: Faulty | null; tydzien: Faulty | null };
  inody: { uzyte: number | null; limit: number | null; blad: string | null };
  wolneSql: {
    wToku: boolean;
    odczytano: string | null;
    wlaczony: boolean | null;
    progSekund: number | null;
    grupy: { sql: string; baza: string; liczba: number; suma: number; max: number; przejrzane: number; ostatnio: string | null }[];
    blad: string | null;
  };
  strona: null | {
    domena: string | null;
    wToku?: boolean;
    odczytano?: string | null;
    statystyki?: null | {
      ruch: { dzien: string; zadania: number; odwiedzajacy: number; bledy5xx: number }[];
      top5xx: { sciezka: string; liczba: number }[];
      ttfbMs: { mediana: number; probki: number } | null;
      log: boolean;
    };
    blad: string | null;
  };
};

export type Wynik<T> = { ok: true; wynik: T } | { ok: false; error: string };

const UPRAWNIENIE = "Podgląd konta klienta (ACCOUNT_DIAGNOSTICS_VIEW)";
const sciezka = (id: string) => `/admin/subscriptions/${encodeURIComponent(id)}/konto/zasoby`;

export async function zasobyKontaAction(subscriptionId: string, wczytajZSerwera = false): Promise<Wynik<ZasobyKonta>> {
  try {
    const wynik = await adminApi<ZasobyKonta>(sciezka(subscriptionId), wczytajZSerwera ? { method: "POST", body: {} } : undefined);
    return { ok: true, wynik };
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
      return { ok: false, error: `Twoja rola nie ma uprawnienia „${UPRAWNIENIE}”.` };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się pobrać zasobów konta." };
  }
}
