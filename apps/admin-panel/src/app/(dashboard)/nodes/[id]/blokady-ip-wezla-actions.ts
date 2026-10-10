"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** F3.2 (D5) — blokady IP węzła (apps/api/src/servers/blokady-ip-wezla.admin.controller.ts, IP_BLOCKS_NODE). */
export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };
export type AkcjaBlokad = "stan" | "wczytaj" | "odblokuj" | "dodaj" | "usun";

const baza = (id: string) => `/admin/servers/${encodeURIComponent(id)}/blokady-ip`;

export async function blokadyIpWezlaAction(serverId: string, co: AkcjaBlokad, dane: { ip?: string; powod?: string } = {}): Promise<Wynik> {
  const ip = (dane.ip ?? "").trim();
  const powod = (dane.powod ?? "").trim();
  try {
    if (co === "stan") return { ok: true, wynik: await adminApi(baza(serverId)) };
    if (co === "wczytaj") return { ok: true, wynik: await adminApi(`${baza(serverId)}/wczytaj`, { method: "POST", body: {} }) };
    if (co === "odblokuj") return { ok: true, wynik: await adminApi(`${baza(serverId)}/odblokuj`, { method: "POST", body: { ip, powod } }) };
    if (co === "dodaj" || co === "usun") return { ok: true, wynik: await adminApi(`${baza(serverId)}/biala-lista`, { method: "POST", body: { ip, powod, akcja: co } }) };
    return { ok: false, error: "Nieznana akcja." };
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
      return { ok: false, error: "Twoja rola nie ma uprawnienia „Blokady IP węzła (IP_BLOCKS_NODE)”." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się. Spróbuj ponownie." };
  }
}
