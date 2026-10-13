"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** 13.10 — strażnik węzła (apps/api/src/servers/straznik-wezla.service.ts, NODES_VIEW; wyłącznik restartu — ADMIN). */
export interface ZdarzenieStraznika {
  id: string;
  rodzaj: string;
  nazwa: string;
  stan: "naprawa" | "naprawiono" | "nie_naprawiono" | "restart" | "tylko_alarm";
  objaw: string;
  kroki: { at: string; krok: string; wynik: string }[];
  katalog: string | null;
  wykrytoAt: string;
  zakonczonoAt: string | null;
  updatedAt: string;
}
export interface StanStraznika {
  restartWezla: boolean;
  zdarzenia: ZdarzenieStraznika[];
}
type Wynik<T> = { ok: true; dane: T } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof AdminApiError ? e.message : "Nie udało się — spróbuj ponownie.");
const baza = (id: string) => `/admin/servers/${encodeURIComponent(id)}/straznik`;

export async function pobierzStraznika(serverId: string): Promise<Wynik<StanStraznika>> {
  try {
    return { ok: true, dane: await adminApi<StanStraznika>(baza(serverId)) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function pobierzDiagnoze(serverId: string, zdarzenieId: string): Promise<Wynik<{ diagnoza: string; katalog: string | null }>> {
  try {
    return { ok: true, dane: await adminApi(`${baza(serverId)}/${encodeURIComponent(zdarzenieId)}/diagnoza`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function ustawRestartWezla(serverId: string, restartWezla: boolean): Promise<Wynik<{ restartWezla: boolean }>> {
  try {
    return { ok: true, dane: await adminApi(`${baza(serverId)}/ustawienia`, { method: "PUT", body: { restartWezla } }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
