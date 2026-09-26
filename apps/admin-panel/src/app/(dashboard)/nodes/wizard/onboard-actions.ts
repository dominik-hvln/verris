"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** PB-31 — kopie off-site floty i Onboard LIVE z panelu. */
export type PodgladOffsite =
  | { skonfigurowany: false }
  | { skonfigurowany: true; host: string; port: number; user: string; sciezka: string; retencjaDni: number; zmienionoAt: string | null };

export interface StanOnboardu {
  zweryfikowany: string | null;
  raport: { ok?: boolean; fail?: number; warn?: number; podsumowanie?: string; at?: string } | null;
  zadanie: { id: string; status: string; createdAt: string; startedAt: string | null; completedAt: string | null; errorMessage: string | null } | null;
  trwa: boolean;
}

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

export async function pobierzStanOnboardu(serverId: string): Promise<Wynik<StanOnboardu>> {
  try {
    return { ok: true, data: await adminApi<StanOnboardu>(`/admin/node-onboard/server/${encodeURIComponent(serverId)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function uruchomOnboard(serverId: string): Promise<Wynik<unknown>> {
  try {
    return { ok: true, data: await adminApi(`/admin/node-onboard/server/${encodeURIComponent(serverId)}/run`, { method: "POST" }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
