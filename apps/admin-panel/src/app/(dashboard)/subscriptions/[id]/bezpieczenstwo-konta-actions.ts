"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/**
 * F3.2 — bezpieczeństwo konta na karcie usługi: „Zablokowało mi IP” (apps/api/src/subscriptions/blokady-ip-konta.admin.
 * controller.ts), wyniki skanera i kwarantanna (konto-klienta*.admin.controller.ts), trafienia WAF (konto/waf).
 * Ścieżki z białej listy — przeglądarka nie poda dowolnej trasy API.
 */
export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };

const ODCZYT = {
  "blokady-ip": { sciezka: "blokady-ip", perm: "Odblokowanie IP klienta (IP_UNBLOCK)" },
  malware: { sciezka: "malware", perm: "Podgląd konta klienta (ACCOUNT_DIAGNOSTICS_VIEW)" },
  waf: { sciezka: "waf", perm: "Podgląd konta klienta (ACCOUNT_DIAGNOSTICS_VIEW)" },
} as const;

const ZAPIS = {
  "sprawdz-ip": { sciezka: "blokady-ip/sprawdz", perm: "Odblokowanie IP klienta (IP_UNBLOCK)" },
  "odblokuj-ip": { sciezka: "blokady-ip/odblokuj", perm: "Odblokowanie IP klienta (IP_UNBLOCK)" },
  kwarantanna: { sciezka: "akcje/kwarantanna", perm: "Akcje na koncie klienta (ACCOUNT_ACTIONS)" },
  przywroc: { sciezka: "akcje/kwarantanna/przywroc", perm: "Akcje na koncie klienta (ACCOUNT_ACTIONS)" },
  "wczytaj-waf": { sciezka: "waf", perm: "Podgląd konta klienta (ACCOUNT_DIAGNOSTICS_VIEW)" },
} as const;

export type OdczytBezpieczenstwa = keyof typeof ODCZYT;
export type ZapisBezpieczenstwa = keyof typeof ZAPIS;

const baza = (id: string) => `/admin/subscriptions/${encodeURIComponent(id)}/konto`;

export async function odczytBezpieczenstwaAction(subscriptionId: string, co: OdczytBezpieczenstwa): Promise<Wynik> {
  const o = Object.hasOwn(ODCZYT, co) ? ODCZYT[co] : undefined;
  if (!o) return { ok: false, error: "Nieznana sekcja." };
  try {
    return { ok: true, wynik: await adminApi(`${baza(subscriptionId)}/${o.sciezka}`) };
  } catch (err) {
    return { ok: false, error: komunikat(err, o.perm) };
  }
}

export async function zapisBezpieczenstwaAction(
  subscriptionId: string,
  co: ZapisBezpieczenstwa,
  dane: { ip?: string; powod?: string; zgloszenie?: string; sciezki?: string[]; wpisy?: string[] },
): Promise<Wynik> {
  const z = Object.hasOwn(ZAPIS, co) ? ZAPIS[co] : undefined;
  if (!z) return { ok: false, error: "Nieznana akcja." };
  const body: Record<string, unknown> = {};
  if (co === "sprawdz-ip" || co === "odblokuj-ip") body.ip = (dane.ip ?? "").trim();
  if (co === "kwarantanna") body.sciezki = dane.sciezki ?? [];
  if (co === "przywroc") body.wpisy = dane.wpisy ?? [];
  if (co === "odblokuj-ip" || co === "kwarantanna" || co === "przywroc") {
    body.powod = (dane.powod ?? "").trim();
    if (dane.zgloszenie?.trim()) body.zgloszenie = dane.zgloszenie.trim();
  }
  try {
    return { ok: true, wynik: await adminApi(`${baza(subscriptionId)}/${z.sciezka}`, { method: "POST", body }) };
  } catch (err) {
    return { ok: false, error: komunikat(err, z.perm) };
  }
}

/** 403 strażnika uprawnień → nazwa brakującego uprawnienia; inna odmowa API (np. adres spoza klienta) — swoją treścią. */
function komunikat(err: unknown, uprawnienie: string): string {
  if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
    return `Twoja rola nie ma uprawnienia „${uprawnienie}”.`;
  }
  if (err instanceof AdminApiError || err instanceof Error) return err.message;
  return "Nie udało się. Spróbuj ponownie.";
}
