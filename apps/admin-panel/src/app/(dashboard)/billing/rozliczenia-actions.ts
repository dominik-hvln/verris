"use server";

import { revalidatePath } from "next/cache";
import { AdminApiError, adminApi } from "@/lib/api";

/**
 * F3.6 — operacje pieniężne z panelu (apps/api/src/billing/rozliczenia.admin.controller.ts, BILLING_MANAGE).
 * Ścieżki budowane tutaj z identyfikatora klienta (UUID) — dane z przeglądarki nie wybierają trasy.
 */
export type WynikRozliczen = { ok: true; komunikat: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blad = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : "Nie udało się.");

async function wyslij(sciezka: string, body: Record<string, unknown>, odswiez: string[]): Promise<WynikRozliczen> {
  try {
    const r = await adminApi<{ komunikat?: string }>(sciezka, { method: "POST", body });
    for (const p of odswiez) revalidatePath(p);
    return { ok: true, komunikat: r?.komunikat ?? "Zapisano." };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function ponowAutoDoladowanieAction(userId: string, powod: string, zgloszenie?: string): Promise<WynikRozliczen> {
  if (!UUID.test(userId)) return { ok: false, error: "Niepoprawny klient." };
  return wyslij(`/admin/rozliczenia/nieudane-platnosci/auto-doladowanie/${userId}/ponow`, { powod, zgloszenie: zgloszenie?.trim() || undefined }, ["/billing/nieudane"]);
}

export async function wplataPrzelewemAction(
  userId: string,
  b: { kwota: number; tytul: string; referencja: string; dataWplaty: string; zgloszenie?: string },
): Promise<WynikRozliczen> {
  if (!UUID.test(userId)) return { ok: false, error: "Niepoprawny klient." };
  return wyslij(`/admin/rozliczenia/klienci/${userId}/wplaty`, { ...b, zgloszenie: b.zgloszenie?.trim() || undefined }, [`/customers/${userId}`]);
}

export async function korektaSaldaAction(
  userId: string,
  b: { kierunek: "plus" | "minus"; kwota: number; powod: string; zgloszenie?: string; klucz: string },
): Promise<WynikRozliczen> {
  if (!UUID.test(userId)) return { ok: false, error: "Niepoprawny klient." };
  return wyslij(`/admin/rozliczenia/klienci/${userId}/portfel/korekta`, { ...b, zgloszenie: b.zgloszenie?.trim() || undefined }, [`/customers/${userId}`]);
}
