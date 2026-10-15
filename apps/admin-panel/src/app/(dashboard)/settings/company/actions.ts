"use server";

import { adminApi, AdminApiError } from "@/lib/api";

export interface SellerCompany {
  name: string;
  nip: string;
  regon: string;
  krs: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  bankAccount: string;
}

export interface KsefSettings {
  enabled: boolean;
  env: "test" | "demo" | "prod";
  nip: string;
  tokenSet: boolean;
}

export interface KsefOverview {
  config: {
    enabled: boolean;
    env: string;
    baseUrl: string;
    nipSet: boolean;
    tokenSet: boolean;
  };
  counts: Record<string, number>;
  recentRejected: Array<{ id: string; number: string; error: string | null; updatedAt: string }>;
}

function err(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Błąd";
}

export async function fetchCompany() {
  try {
    return { data: await adminApi<SellerCompany>("/admin/platform-settings/company") };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function saveCompany(input: SellerCompany) {
  try {
    const data = await adminApi<SellerCompany>("/admin/platform-settings/company", {
      method: "PATCH",
      body: input,
    });
    return { data };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function fetchKsef() {
  try {
    return { data: await adminApi<KsefSettings>("/admin/platform-settings/ksef") };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function saveKsef(input: {
  enabled: boolean;
  env: "test" | "demo" | "prod";
  nip: string;
  token?: string;
}) {
  try {
    const data = await adminApi<KsefSettings>("/admin/platform-settings/ksef", {
      method: "PATCH",
      body: input,
    });
    return { data };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function fetchKsefOverview() {
  try {
    return { data: await adminApi<KsefOverview>("/admin/ksef/overview") };
  } catch (e) {
    return { error: err(e) };
  }
}

/** Przegląd 15.10 — faktury VAT panelu sprzed okna automatu (7 dni), których nie ma w kolejce KSeF. */
export interface KsefZalegle {
  liczba: number;
  przyklady: Array<{ id: string; number: string; issuedAt: string | null }>;
}

export async function fetchKsefZalegle() {
  try {
    return { data: await adminApi<KsefZalegle>("/admin/ksef/zalegle") };
  } catch (e) {
    return { error: err(e) };
  }
}

/** `oczekiwanaLiczba` z podglądu — API odmawia, gdy lista zmieniła się od jego wyświetlenia. */
export async function zakolejkujKsefZalegle(oczekiwanaLiczba: number) {
  try {
    return {
      data: await adminApi<{ zakolejkowane: number; srodowisko: string }>("/admin/ksef/zalegle", {
        method: "POST",
        body: { oczekiwanaLiczba },
      }),
    };
  } catch (e) {
    return { error: err(e) };
  }
}

/** FAK-01 / KSeF 12.10 — kto wystawia faktury VAT: panel (VFV/VFK + KSeF) albo program księgowy (VDR/VDK). */
export type TrybFakturowania = "panel" | "zewnetrzny";

export async function fetchTrybFakturowania() {
  try {
    return { data: await adminApi<{ tryb: TrybFakturowania }>("/admin/platform-settings/faktury-tryb") };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function saveTrybFakturowania(tryb: TrybFakturowania) {
  try {
    const data = await adminApi<{ tryb: TrybFakturowania }>("/admin/platform-settings/faktury-tryb", {
      method: "PATCH",
      body: { tryb },
    });
    return { data };
  } catch (e) {
    return { error: err(e) };
  }
}
