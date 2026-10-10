"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/**
 * F3.1 — poczta konta na karcie usługi (apps/api/src/subscriptions/poczta-konta.admin.controller.ts): stan i blokada
 * wysyłki, kolejka konta (nagłówki, bez treści), usunięcie wiadomości konta z kolejki. Ścieżki z białej listy —
 * przeglądarka nie poda dowolnej trasy API.
 */
export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };

const ODCZYT = { wysylka: "wysylka", kolejka: "kolejka-poczty", limit: "wysylka/limit" } as const;
const ZAPIS = {
  zablokuj: { sciezka: "wysylka/zablokuj", perm: "Blokada wysyłki konta (MAIL_SEND_BLOCK)" },
  zwolnij: { sciezka: "wysylka/zwolnij", perm: "Blokada wysyłki konta (MAIL_SEND_BLOCK)" },
  wczytaj: { sciezka: "kolejka-poczty/wczytaj", perm: "Kolejka poczty konta (MAIL_QUEUE_VIEW)" },
  usun: { sciezka: "kolejka-poczty/usun", perm: "Usunięcie wiadomości konta z kolejki (MAIL_SEND_BLOCK)" },
  // F3.1 reszta — limit wysyłki konta: odczyt z serwera od L2, zmiana od L3.
  "wczytaj-limit": { sciezka: "wysylka/limit/wczytaj", perm: "Kolejka poczty konta (MAIL_QUEUE_VIEW)" },
  limit: { sciezka: "wysylka/limit", perm: "Blokada wysyłki konta (MAIL_SEND_BLOCK)" },
} as const;

export type OdczytPoczty = keyof typeof ODCZYT;
export type ZapisPoczty = keyof typeof ZAPIS;

const baza = (id: string) => `/admin/subscriptions/${encodeURIComponent(id)}/konto`;

export async function odczytPocztyAction(subscriptionId: string, co: OdczytPoczty): Promise<Wynik> {
  const sciezka = Object.hasOwn(ODCZYT, co) ? ODCZYT[co] : undefined;
  if (!sciezka) return { ok: false, error: "Nieznana sekcja poczty." };
  try {
    return { ok: true, wynik: await adminApi(`${baza(subscriptionId)}/${sciezka}`) };
  } catch (err) {
    return { ok: false, error: komunikat(err, co === "kolejka" ? "Kolejka poczty konta (MAIL_QUEUE_VIEW)" : "Poczta konta (MAIL_QUEUE_VIEW lub MAIL_SEND_BLOCK)") };
  }
}

export async function zapisPocztyAction(
  subscriptionId: string,
  co: ZapisPoczty,
  dane: { powod?: string; zgloszenie?: string; szukaj?: string; ids?: string[]; limit?: number | null },
): Promise<Wynik> {
  const z = Object.hasOwn(ZAPIS, co) ? ZAPIS[co] : undefined;
  if (!z) return { ok: false, error: "Nieznana akcja." };
  const body: Record<string, unknown> = {};
  if (co === "wczytaj") {
    if (dane.szukaj?.trim()) body.szukaj = dane.szukaj.trim();
  } else if (co !== "wczytaj-limit") {
    body.powod = (dane.powod ?? "").trim();
    if (dane.zgloszenie?.trim()) body.zgloszenie = dane.zgloszenie.trim();
    if (co === "usun") body.ids = dane.ids ?? [];
    if (co === "limit") body.limit = dane.limit ?? null;
  }
  try {
    return { ok: true, wynik: await adminApi(`${baza(subscriptionId)}/${z.sciezka}`, { method: "POST", body }) };
  } catch (err) {
    return { ok: false, error: komunikat(err, z.perm) };
  }
}

/** 403 strażnika uprawnień → nazwa brakującego uprawnienia; inna odmowa API zostaje swoją treścią. */
function komunikat(err: unknown, uprawnienie: string): string {
  if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
    return `Twoja rola nie ma uprawnienia „${uprawnienie}”.`;
  }
  if (err instanceof AdminApiError || err instanceof Error) return err.message;
  return "Nie udało się. Spróbuj ponownie.";
}
