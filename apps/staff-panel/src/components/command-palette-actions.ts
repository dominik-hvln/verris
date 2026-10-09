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

export async function staffGlobalSearchAction(q: string): Promise<StaffSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await staffApi<{ results: StaffSearchResult[] }>(
      `/admin/search?q=${encodeURIComponent(q.trim())}`,
    );
    // /admin/search zwraca też węzły i migracje (panel admina) — panel obsługi pokazuje tylko to, do czego ma trasy.
    return (res.results ?? []).filter((r) => OBSLUGIWANE.has(r.type));
  } catch {
    return [];
  }
}
