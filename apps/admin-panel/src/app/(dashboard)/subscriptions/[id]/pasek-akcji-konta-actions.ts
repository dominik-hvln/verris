"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/**
 * F2.2 — pasek akcji konta (apps/api/src/subscriptions/konto-klienta-akcje.admin.controller.ts). Ścieżki z białej
 * listy — przeglądarka nie poda dowolnej trasy API. Hasła nie ma ani w żądaniu, ani w odpowiedzi.
 */
export type AkcjaPaska =
  | "haslo-skrzynki"
  | "haslo-ftp"
  | "haslo-bazy"
  | "ssl"
  | "php"
  | "kopia"
  | "skan"
  | "dns-dodaj"
  | "dns-zmien"
  | "dns-usun";

const SCIEZKA: Record<AkcjaPaska, string> = {
  "haslo-skrzynki": "haslo-skrzynki",
  "haslo-ftp": "haslo-ftp",
  "haslo-bazy": "haslo-bazy",
  ssl: "ssl",
  php: "php",
  kopia: "kopia",
  skan: "skan",
  "dns-dodaj": "dns",
  "dns-zmien": "dns/zmien",
  "dns-usun": "dns/usun",
};

/** Odczyty potrzebne formularzom paska (te same trasy co karta „Konto klienta”, każdy odczyt w dzienniku). */
export type OdczytPaska = "domeny" | "poczta" | "ftp" | "bazy" | "php" | "dns" | "malware";
const ODCZYTY: readonly OdczytPaska[] = ["domeny", "poczta", "ftp", "bazy", "php", "dns", "malware"];

export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };

export async function akcjaKontaAction(
  subscriptionId: string,
  akcja: AkcjaPaska,
  dane: { powod: string; zgloszenie?: string } & Record<string, unknown>,
): Promise<Wynik> {
  // Własne klucze mapy — „constructor”/„toString” z przeglądarki nie są akcją.
  const sciezka = Object.hasOwn(SCIEZKA, akcja) ? SCIEZKA[akcja] : undefined;
  if (!sciezka) return { ok: false, error: "Nieznana akcja." };
  const { zgloszenie, ...reszta } = dane;
  try {
    const wynik = await adminApi(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/konto/akcje/${sciezka}`, {
      method: "POST",
      body: { ...reszta, powod: dane.powod.trim(), ...(zgloszenie?.trim() ? { zgloszenie: zgloszenie.trim() } : {}) },
    });
    return { ok: true, wynik };
  } catch (err) {
    return { ok: false, error: komunikat(err, akcja.startsWith("dns") ? "Edycja DNS na koncie klienta (DNS_MANAGE)" : "Akcje na koncie klienta (ACCOUNT_ACTIONS)") };
  }
}

export async function odczytDlaPaskaAction(subscriptionId: string, co: OdczytPaska, domena?: string): Promise<Wynik> {
  if (!ODCZYTY.includes(co)) return { ok: false, error: "Nieznana sekcja konta." };
  const q = domena ? `?domain=${encodeURIComponent(domena)}` : "";
  try {
    return { ok: true, wynik: await adminApi(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/konto/${co}${q}`) };
  } catch (err) {
    return { ok: false, error: komunikat(err, "Podgląd konta klienta (ACCOUNT_DIAGNOSTICS_VIEW)") };
  }
}

/**
 * 403 strażnika uprawnień („…nie ma uprawnień do tej operacji”) → nazwa brakującego uprawnienia. Inna odmowa API
 * (np. „Personel może zmieniać wyłącznie usługi klientów”) zostaje swoją treścią — to nie brak uprawnienia roli.
 */
function komunikat(err: unknown, uprawnienie: string): string {
  if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
    return `Twoja rola nie ma uprawnienia „${uprawnienie}”.`;
  }
  if (err instanceof AdminApiError || err instanceof Error) return err.message;
  return "Nie udało się. Spróbuj ponownie.";
}
