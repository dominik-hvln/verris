"use server";

import { staffApi, StaffApiError } from "@/lib/staff-api";
import { czySekcjaKonta, type DaneSekcji, type ParametrySekcji, type SekcjaKonta } from "./konto-klienta-widok";

/** PB-42 — jedna sekcja konta klienta na żądanie (odczyt z serwera + wpis w dzienniku po stronie API). */
export async function wczytajSekcjeKontaAction(
  subscriptionId: string,
  sekcja: SekcjaKonta,
  parametry: ParametrySekcji = {},
): Promise<{ ok: true; wynik: DaneSekcji } | { ok: false; error: string }> {
  if (!czySekcjaKonta(sekcja)) return { ok: false, error: "Nieznana sekcja konta." };
  const q = new URLSearchParams();
  if (parametry.domain) q.set("domain", parametry.domain);
  if (sekcja === "logi") {
    q.set("type", parametry.type === "access" ? "access" : "error");
    q.set("lines", String(parametry.lines ?? 200));
  }
  const qs = q.toString();
  try {
    const dane = await staffApi(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/konto/${sekcja}${qs ? `?${qs}` : ""}`);
    return { ok: true, wynik: { sekcja, dane } as DaneSekcji };
  } catch (err) {
    return { ok: false, error: komunikatBledu(err) };
  }
}

/**
 * PB-42 — świeży odczyt dziennika poczty z serwera (zadanie na węźle tylko czyta log; wpis w dzienniku po stronie API).
 * Zwraca stan dziennika (zwykle „wczytywanie w toku”) — wynik pokazuje „Odśwież” sekcji.
 */
export async function zlecDziennikPocztyAction(
  subscriptionId: string,
  adres?: string,
): Promise<{ ok: true; wynik: DaneSekcji } | { ok: false; error: string }> {
  try {
    const dane = await staffApi(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/konto/logi-poczty`, {
      method: "POST",
      body: adres?.trim() ? { address: adres.trim() } : {},
    });
    return { ok: true, wynik: { sekcja: "logi-poczty", dane } as DaneSekcji };
  } catch (err) {
    return { ok: false, error: komunikatBledu(err) };
  }
}

function komunikatBledu(err: unknown): string {
  if (err instanceof StaffApiError && err.status === 403) {
    return "Twoja rola nie ma uprawnienia „Podgląd konta klienta”. Poproś administratora o jego nadanie.";
  }
  if (err instanceof StaffApiError) return err.message;
  return "Nie udało się wczytać danych konta. Spróbuj ponownie.";
}
