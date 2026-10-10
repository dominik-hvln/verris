"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** F3.1 — kolejka poczty węzła (apps/api/src/servers/kolejka-poczty-wezla.admin.controller.ts, MAIL_QUEUE_NODE). */
export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };

const baza = (id: string) => `/admin/servers/${encodeURIComponent(id)}/kolejka-poczty`;

export async function kolejkaWezlaAction(serverId: string, co: "stan" | "wczytaj" | "wypchnij", dane: { szukaj?: string; powod?: string } = {}): Promise<Wynik> {
  try {
    if (co === "stan") return { ok: true, wynik: await adminApi(baza(serverId)) };
    if (co === "wczytaj") return { ok: true, wynik: await adminApi(`${baza(serverId)}/wczytaj`, { method: "POST", body: dane.szukaj?.trim() ? { szukaj: dane.szukaj.trim() } : {} }) };
    if (co === "wypchnij") return { ok: true, wynik: await adminApi(`${baza(serverId)}/wypchnij`, { method: "POST", body: { powod: (dane.powod ?? "").trim() } }) };
    return { ok: false, error: "Nieznana akcja." };
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
      return { ok: false, error: "Twoja rola nie ma uprawnienia „Kolejka poczty węzła (MAIL_QUEUE_NODE)”." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się. Spróbuj ponownie." };
  }
}
