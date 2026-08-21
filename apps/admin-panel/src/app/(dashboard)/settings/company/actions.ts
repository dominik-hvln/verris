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

export async function retryKsefInvoice(id: string) {
  try {
    await adminApi(`/admin/ksef/invoices/${id}/retry`, { method: "POST" });
    return { ok: true as const };
  } catch (e) {
    return { error: err(e) };
  }
}
