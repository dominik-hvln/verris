"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** PB-33 — „Wersje stosu floty” (tylko admin). */
export interface WidokStosu {
  manifest: { wersja: string; daKanal: string; daCommit: string; php1: string; mariadb: string; litespeedLinia: string };
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
