"use server";

import { apiFetch, ApiError } from "@/lib/api";

export interface PartnerKonta {
  nazwa: string;
  logoUrl: string | null;
  kontakt: string;
}

/** O-05 — kto prowadzi konto (reseller). `null` = konto samodzielne albo brak danych. */
export async function pobierzPartnera(): Promise<PartnerKonta | null> {
  try {
    return (await apiFetch<PartnerKonta | null>("/me/partner")) || null;
  } catch {
    return null;
  }
}

/** O-05 — klient sam odpina konto od partnera (tylko właściciel; subkonto dostaje odmowę w API). */
export async function odepnijOdPartnera(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch("/me/partner", { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : "Błąd połączenia z serwerem" };
  }
}
