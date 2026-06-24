"use server";

import { staffApi } from "@/lib/staff-api";

export interface StaffSearchResult {
  type: "user" | "service" | "domain" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  userId: string | null;
}

export async function staffGlobalSearchAction(q: string): Promise<StaffSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await staffApi<{ results: StaffSearchResult[] }>(
      `/admin/search?q=${encodeURIComponent(q.trim())}`,
    );
    return res.results ?? [];
  } catch {
    return [];
  }
}
