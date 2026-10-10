"use server";

import { adminApi, AdminApiError } from "@/lib/api";
import type { Wynik } from "./kolejka-wezla-actions";

/** F3.1 reszta — nadawcy i odrzucenia węzła, RBL IP węzła (apps/api/src/servers/poczta-wezla.admin.controller.ts, MAIL_QUEUE_NODE). */
const baza = (id: string) => `/admin/servers/${encodeURIComponent(id)}/poczta`;

export async function pocztaWezlaAction(serverId: string, co: "statystyki" | "wczytaj" | "rbl"): Promise<Wynik> {
  try {
    if (co === "statystyki") return { ok: true, wynik: await adminApi(`${baza(serverId)}/statystyki`) };
    if (co === "wczytaj") return { ok: true, wynik: await adminApi(`${baza(serverId)}/statystyki/wczytaj`, { method: "POST", body: {} }) };
    if (co === "rbl") return { ok: true, wynik: await adminApi(`${baza(serverId)}/rbl`, { method: "POST", body: {} }) };
    return { ok: false, error: "Nieznana akcja." };
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
      return { ok: false, error: "Twoja rola nie ma uprawnienia „Kolejka poczty węzła (MAIL_QUEUE_NODE)”." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się. Spróbuj ponownie." };
  }
}
