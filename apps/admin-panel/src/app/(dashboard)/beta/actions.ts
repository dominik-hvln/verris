"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/** PB-26 — zaproszenia do testów przed startem. */
export interface TesterRow {
  id: string;
  email: string;
  name: string | null;
  code: string;
  wyslane: string | null;
  stan: "CZEKA" | "UZYTY" | "WYCOFANY" | "WYGASL";
  waznyDo: string | null;
  konto: { email: string; od: string } | null;
  aktywneUslugi: number;
  zgloszenia: number;
  zgloszeniaOtwarte: number;
}

export async function listTesters(): Promise<TesterRow[]> {
  return adminApi<TesterRow[]>("/admin/beta/invites");
}

const blad = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : "Nieznany błąd.");

export async function inviteTesterAction(input: { email: string; name?: string }): Promise<
  { ok: true; code: string; mailWyslany: boolean } | { ok: false; error: string }
> {
  try {
    const r = await adminApi<{ code: string; mailWyslany: boolean }>("/admin/beta/invites", {
      method: "POST",
      body: { email: input.email.trim(), ...(input.name?.trim() ? { name: input.name.trim() } : {}) },
    });
    revalidatePath("/beta");
    return { ok: true, code: r.code, mailWyslany: r.mailWyslany };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function revokeInviteAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi(`/admin/beta/invites/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    revalidatePath("/beta");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
