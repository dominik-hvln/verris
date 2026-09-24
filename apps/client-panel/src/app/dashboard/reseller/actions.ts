'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type ResellerOverview = {
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  brandName: string | null;
  markupPct: number;
  code: string;
  inviteLink: string;
  clientsCount: number;
  monthlyRetail: number;
  monthlyWholesale: number;
};
export type ResellerClient = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  services: { id: string; plan: string | null; status: string; wholesale: number; retail: number; currency: string }[];
};

export async function fetchResellerOverview(): Promise<
  { ok: true; data: ResellerOverview } | { ok: false; notReseller: boolean }
> {
  try {
    const data = await apiFetch<ResellerOverview>('/reseller/me/overview');
    return { ok: true, data };
  } catch (e) {
    const notReseller = e instanceof ApiError && (e.status === 403 || e.status === 404);
    return { ok: false, notReseller: !!notReseller };
  }
}

export async function fetchResellerClients(): Promise<ResellerClient[]> {
  try {
    return await apiFetch<ResellerClient[]>('/reseller/me/clients');
  } catch {
    return [];
  }
}

/** O-08 — wniosek o program resellerski. */
export async function applyReseller(brandName: string): Promise<{ ok: true; data: ResellerOverview } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await apiFetch<ResellerOverview>('/reseller/me/apply', { method: 'POST', body: JSON.stringify({ brandName }) }) };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : 'Błąd' };
  }
}

/** O-06 — reseller zakłada konto klientowi (mail z linkiem „ustaw hasło”, limit dzienny). */
export async function createResellerClient(input: { email: string; firstName: string; lastName: string }): Promise<
  { ok: true; data: { id: string; email: string; mailWyslany: boolean; pozostaloDzis: number } } | { ok: false; error: string }
> {
  try {
    return { ok: true, data: await apiFetch('/reseller/me/clients', { method: 'POST', body: JSON.stringify(input) }) };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : 'Błąd' };
  }
}

/** O-07 — własny narzut resellera (0–300%). */
export async function setResellerMarkup(markupPct: number): Promise<{ ok: true; data: ResellerOverview } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await apiFetch<ResellerOverview>('/reseller/me/markup', { method: 'POST', body: JSON.stringify({ markupPct }) }) };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : 'Błąd' };
  }
}
