"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/**
 * PB-31 — kopie off-site floty (jedna konfiguracja dla wszystkich węzłów). API tylko dla ADMIN-a
 * (servers/onboard.admin.controller.ts) — to klucze do kopii wszystkich klientów.
 */
export type PodgladOffsite =
  | { skonfigurowany: false }
  | { skonfigurowany: true; host: string; port: number; user: string; sciezka: string; retencjaDni: number; zmienionoAt: string | null };

type Wynik<T> = { ok: true; data: T } | { ok: false; error: string };

const blad = (e: unknown) => (e instanceof AdminApiError ? e.message : "Nie udało się — spróbuj ponownie.");

export async function pobierzOffsite(): Promise<Wynik<PodgladOffsite>> {
  try {
    return { ok: true, data: await adminApi<PodgladOffsite>("/admin/node-onboard/backup-offsite") };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function zapiszOffsite(dane: Record<string, unknown>): Promise<Wynik<PodgladOffsite>> {
  try {
    return { ok: true, data: await adminApi<PodgladOffsite>("/admin/node-onboard/backup-offsite", { method: "PUT", body: dane }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
