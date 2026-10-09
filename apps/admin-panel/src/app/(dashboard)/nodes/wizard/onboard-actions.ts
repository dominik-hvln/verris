"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** PB-31 — Onboard LIVE z panelu (kopie off-site floty: components/kopie-offsite-actions.ts). */
export interface StanOnboardu {
  zweryfikowany: string | null;
  /** acceptsNewAccounts — admin może wstrzymać węzeł mimo zielonego onboardu. */
  noweKonta?: boolean;
  raport: { ok?: boolean; fail?: number; warn?: number; podsumowanie?: string; at?: string } | null;
  zadanie: { id: string; status: string; createdAt: string; startedAt: string | null; completedAt: string | null; errorMessage: string | null } | null;
  trwa: boolean;
}

type Wynik<T> = { ok: true; data: T } | { ok: false; error: string };

const blad = (e: unknown) => (e instanceof AdminApiError ? e.message : "Nie udało się — spróbuj ponownie.");

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
