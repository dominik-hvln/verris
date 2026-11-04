"use server";

import { apiFetch } from "@/lib/api";

/** A2-06 — numer aktualnie opublikowanej wersji umowy powierzenia (null = DPA nieopublikowana). */
export async function aktualnaWersjaDpa(): Promise<string | null> {
  try {
    const doc = await apiFetch<{ version: string }>("/legal/DPA?locale=pl", { cache: "no-store" });
    return doc?.version ?? null;
  } catch {
    return null;
  }
}
