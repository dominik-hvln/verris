"use server";

import { adminApi } from "@/lib/api";

export interface GlobalSearchResult {
  type: "user" | "service" | "domain" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearchAction(q: string): Promise<GlobalSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await adminApi<{ results: GlobalSearchResult[] }>(
      `/admin/search?q=${encodeURIComponent(q.trim())}`,
    );
    return res.results ?? [];
  } catch {
    return [];
  }
}
