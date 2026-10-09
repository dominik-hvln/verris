"use server";

import { staffApi } from "@/lib/staff-api";

export interface StaffSearchResult {
  type: "user" | "service" | "domain" | "invoice" | "ticket";
  id: string;
  title: string;
  subtitle: string;
  userId: string | null;
}

const OBSLUGIWANE = new Set<string>(["user", "service", "domain", "invoice", "ticket"]);
/** Typy, które panel obsługi otwiera na karcie klienta (/crm/:userId — CUSTOMERS_VIEW). */
const PRZEZ_KARTE_KLIENTA = new Set<string>(["user", "domain", "invoice"]);

export async function staffGlobalSearchAction(q: string): Promise<StaffSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await staffApi<{ results: StaffSearchResult[]; pominiete?: string[] }>(
      `/admin/search?q=${encodeURIComponent(q.trim())}`,
    );
    // /admin/search zwraca też węzły i migracje (panel admina) — panel obsługi pokazuje tylko to, do czego ma trasy.
    // Bez CUSTOMERS_VIEW (API pomija klientów) karta klienta się nie otworzy — bez faktur i domen prowadzących na nią.
    const bezKarty = res.pominiete?.includes("user") ?? false;
    return (res.results ?? []).filter((r) => OBSLUGIWANE.has(r.type) && !(bezKarty && PRZEZ_KARTE_KLIENTA.has(r.type)));
  } catch {
    return [];
  }
}
