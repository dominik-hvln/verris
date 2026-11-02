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
  /** Strona „Testy (beta)” w panelu klienta: odhaczone kroki i uwagi (null, gdy kod jeszcze nieużyty). */
  postep: {
    zrobione: number;
    wszystkie: number;
    zaktualizowano: string | null;
    kroki: Record<string, string>;
    uwagi: Record<string, string>;
  } | null;
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

/** Otwarta beta — zgłoszenia z formularza verris.pl/beta (double opt-in, potem decyzja tutaj). */
export type StatusZgloszenia = "NIEPOTWIERDZONE" | "NOWE" | "ZAPROSZONE" | "ODRZUCONE";

export interface ZgloszenieRow {
  id: string;
  imie: string;
  email: string;
  zakres: string[];
  strona: string | null;
  obecnyHosting: string | null;
  uwagi: string | null;
  zrodlo: { source: string | null; campaign: string | null; content?: string | null } | null;
  status: StatusZgloszenia;
  utworzone: string;
  potwierdzone: string | null;
  decyzjaAt: string | null;
  kod: string | null;
}

export interface ListaZgloszen {
  liczby: Record<StatusZgloszenia, number>;
  zgloszenia: ZgloszenieRow[];
}

export async function listZgloszenia(status?: StatusZgloszenia): Promise<ListaZgloszen> {
  return adminApi<ListaZgloszen>(`/admin/beta/zgloszenia${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}

export async function zaprosZgloszenieAction(id: string): Promise<
  { ok: true; code: string; mailWyslany: boolean } | { ok: false; error: string }
> {
  try {
    const r = await adminApi<{ code: string; mailWyslany: boolean }>(`/admin/beta/zgloszenia/${encodeURIComponent(id)}/zapros`, { method: "POST" });
    revalidatePath("/beta");
    return { ok: true, code: r.code, mailWyslany: r.mailWyslany };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function odrzucZgloszenieAction(id: string, powiadom: boolean): Promise<
  { ok: true; mailWyslany: boolean } | { ok: false; error: string }
> {
  try {
    const r = await adminApi<{ mailWyslany: boolean }>(`/admin/beta/zgloszenia/${encodeURIComponent(id)}/odrzuc`, {
      method: "POST",
      body: { powiadom },
    });
    revalidatePath("/beta");
    return { ok: true, mailWyslany: r.mailWyslany };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
