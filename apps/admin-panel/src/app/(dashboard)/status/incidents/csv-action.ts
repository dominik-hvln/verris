"use server";

import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

export async function downloadIncidentsCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: string }
> {
  const token = await getAdminAuthToken();
  if (!token) return { ok: false, error: "Brak sesji administracyjnej" };

  try {
    const res = await fetch(`${API_URL}/admin/status/incidents/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `API ${res.status}` };
    }
    const csv = await res.text();
    const filename = `ekohost-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    return { ok: true, csv, filename };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
