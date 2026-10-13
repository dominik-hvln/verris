"use server";

import { staffApi, StaffApiError } from "@/lib/staff-api";

/**
 * 14.10 — podgląd logów strony klienta w panelu obsługi: te same trasy co karta węzła w panelu operatora
 * (apps/api/src/servers/uslugi-wezla.admin.controller.ts, uprawnienie NODE_SERVICES). Maska adresów e-mail i IP dla
 * zespołu nakłada API (z roli), nie formularz.
 */
export type WynikLogow<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };

export interface ZamowienieLogu {
  log: string;
  linie: number;
  filtr?: string;
  domena?: string;
  uzytkownik?: string;
  od?: string;
  do?: string;
}

const baza = (serverId: string) => `/admin/servers/${encodeURIComponent(serverId)}/uslugi`;

export async function logiStronyAction(serverId: string, co: "stan" | "log", z?: ZamowienieLogu): Promise<WynikLogow> {
  try {
    if (co === "stan") return { ok: true, wynik: await staffApi(baza(serverId)) };
    if (!z) return { ok: false, error: "Wybierz log." };
    const body: Record<string, unknown> = { log: z.log, linie: z.linie };
    for (const k of ["filtr", "domena", "uzytkownik", "od", "do"] as const) {
      const v = (z[k] ?? "").trim();
      if (v) body[k] = v;
    }
    return { ok: true, wynik: await staffApi(`${baza(serverId)}/log`, { method: "POST", body }) };
  } catch (err) {
    if (err instanceof StaffApiError && err.status === 403) {
      return { ok: false, error: "Twoja rola nie ma uprawnienia „Usługi i logi węzła (NODE_SERVICES)”." };
    }
    if (err instanceof StaffApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Nie udało się odczytać logu. Spróbuj ponownie." };
  }
}
