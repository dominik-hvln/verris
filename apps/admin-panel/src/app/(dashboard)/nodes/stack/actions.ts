"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** Operacje floty: PB-33 manifest i wyrównanie, pakiety DA na flocie (w API tylko admin). */
export interface WidokStosu {
  manifest: { wersja: string; daKanal: string; daCommit: string; php1: string; mariadb: string; litespeedLinia: string; phpAlt: string[] };
  dozwolone: Record<"mariadb" | "php1" | "daKanal" | "litespeedLinia", { v: string; opis: string }[]>;
  wezly: {
    id: string;
    nazwa: string;
    status: string;
    daVersion: string | null;
    zgodnosc: { co: string; oczekiwane: string; faktyczne: string | null; zgodne: boolean | null }[];
  }[];
}

type Wynik<T> = { ok: true; data: T } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof AdminApiError ? e.message : "Nie udało się — spróbuj ponownie.");

export async function pobierzStos(): Promise<Wynik<WidokStosu>> {
  try {
    return { ok: true, data: await adminApi<WidokStosu>("/admin/stack-manifest") };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function zapiszStos(dane: Record<string, string>): Promise<Wynik<WidokStosu>> {
  try {
    return { ok: true, data: await adminApi<WidokStosu>("/admin/stack-manifest", { method: "PUT", body: dane }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function wyrownajFlote(): Promise<Wynik<{ queued: number; skipped: number; kanarek: string | null }>> {
  try {
    return { ok: true, data: await adminApi("/admin/stack-manifest/align", { method: "POST" }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

/** Węzły z DA i liczba kont, które dostaną nowe limity po wysłaniu pakietów. */
export interface PakietyFloty {
  wezly: Array<{ id: string; name: string; konta: number }>;
  konta: number;
}
export interface WynikSyncuFloty {
  wyniki: Array<{ id: string; name: string; ok: boolean; pakiety?: string[]; blad?: string }>;
}

export async function pobierzPakietyFloty(): Promise<Wynik<PakietyFloty>> {
  try {
    return { ok: true, data: await adminApi<PakietyFloty>("/admin/servers/pakiety-floty") };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

/** Pakiety DA wszystkich aktywnych planów → każdy węzeł z DA (po potwierdzeniu admina). */
export async function wyslijPakietyNaFlote(): Promise<Wynik<WynikSyncuFloty>> {
  try {
    return { ok: true, data: await adminApi<WynikSyncuFloty>("/admin/servers/pakiety-floty/sync", { method: "POST" }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
