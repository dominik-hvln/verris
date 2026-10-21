"use server";

import type { AktualizacjaCustomBuild, WagaPoprawki } from "@verris/contracts";
import { adminApi, AdminApiError } from "@/lib/api";

/** 21.10 — weryfikator aktualizacji bezpieczeństwa (API: servers/aktualizacje-wezlow.service.ts). */
export interface WezelAktualizacji {
  id: string;
  nazwa: string;
  status: string;
  dane: "swieze" | "stare" | "brak";
  sprawdzono: string | null;
  poprawek: number;
  waznych: number;
  bladDnf: string | null;
  custombuild: AktualizacjaCustomBuild[];
  bladCustomBuild: string | null;
  altPhp: Record<string, string>;
}

export interface PoprawkaFloty {
  advisory: string;
  waga: WagaPoprawki;
  cve: string[];
  pakiety: string[];
  wezly: { id: string; nazwa: string }[];
}

export interface WynikCve {
  cve: string;
  doZalatania: { id: string; nazwa: string; advisory: string[]; pakiety: string[] }[];
  bezPoprawkiNaLiscie: { id: string; nazwa: string }[];
  bezDanych: { id: string; nazwa: string }[];
  komunikat: string;
}

export interface PodsumowanieAktualizacji {
  wezly: WezelAktualizacji[];
  poprawki: PoprawkaFloty[];
  kafelki: { wezlowZWaznymi: number; poprawek: number; wezlowBezDanych: number };
  cve: WynikCve | null;
}

type Wynik<T> = { ok: true; data: T } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof AdminApiError ? e.message : "Nie udało się — spróbuj ponownie.");

export async function pobierzAktualizacje(cve?: string): Promise<Wynik<PodsumowanieAktualizacji>> {
  try {
    const q = cve ? `?cve=${encodeURIComponent(cve)}` : "";
    return { ok: true, data: await adminApi<PodsumowanieAktualizacji>(`/admin/servers/aktualizacje${q}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function zainstalujPoprawki(input: {
  cve?: string[];
  custombuild?: boolean;
  serwery?: string[];
}): Promise<Wynik<{ queued: number; skipped: number; kanarek: string | null }>> {
  try {
    return { ok: true, data: await adminApi("/admin/servers/aktualizacje/zainstaluj", { method: "POST", body: input }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
