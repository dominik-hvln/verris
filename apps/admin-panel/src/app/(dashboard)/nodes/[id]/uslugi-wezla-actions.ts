"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/** F3.4 — usługi i logi węzła (apps/api/src/servers/uslugi-wezla.admin.controller.ts, NODE_SERVICES). */
export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string; wniosek?: boolean };
export type AkcjaUslug = "stan" | "sprawdz" | "restart" | "restart-wspolnej" | "log";

const baza = (id: string) => `/admin/servers/${encodeURIComponent(id)}/uslugi`;

export async function uslugiWezlaAction(
  serverId: string,
  co: AkcjaUslug,
  dane: {
    usluga?: string;
    powod?: string;
    potwierdzenie?: string;
    log?: string;
    linie?: number;
    filtr?: string;
    domena?: string;
    uzytkownik?: string;
    od?: string;
    do?: string;
  } = {},
): Promise<Wynik> {
  try {
    if (co === "stan") return { ok: true, wynik: await adminApi(baza(serverId)) };
    if (co === "sprawdz") return { ok: true, wynik: await adminApi(`${baza(serverId)}/sprawdz`, { method: "POST", body: {} }) };
    if (co === "restart") {
      return { ok: true, wynik: await adminApi(`${baza(serverId)}/restart`, { method: "POST", body: { usluga: dane.usluga, powod: (dane.powod ?? "").trim() } }) };
    }
    if (co === "restart-wspolnej") {
      const body = { usluga: dane.usluga, powod: (dane.powod ?? "").trim(), potwierdzenie: (dane.potwierdzenie ?? "").trim() };
      return { ok: true, wynik: await adminApi(`${baza(serverId)}/restart-wspolnej`, { method: "POST", body }) };
    }
    if (co === "log") {
      const opc = (v: string | undefined) => (v ?? "").trim();
      const body: Record<string, unknown> = { log: dane.log, linie: dane.linie };
      for (const k of ["filtr", "domena", "uzytkownik", "od", "do"] as const) if (opc(dane[k])) body[k] = opc(dane[k]);
      return { ok: true, wynik: await adminApi(`${baza(serverId)}/log`, { method: "POST", body }) };
    }
    return { ok: false, error: "Nieznana akcja." };
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403 && (err.body as { code?: string } | undefined)?.code === "WYMAGA_WNIOSKU") {
      return { ok: false, error: "Restart działającej usługi wspólnej robi administrator — wyślij wniosek.", wniosek: true };
    }
    if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
      return { ok: false, error: "Twoja rola nie ma uprawnienia „Usługi i logi węzła (NODE_SERVICES)”." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się. Spróbuj ponownie." };
  }
}
