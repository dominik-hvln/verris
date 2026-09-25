'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type ResellerOverview = {
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  brandName: string | null;
  markupPct: number;
  code: string;
  inviteLink: string;
  logoUrl: string | null;
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

// ---- O-05 — działania na klientach ----

export type UslugaKlienta = {
  id: string;
  plan: string | null;
  domena: string | null;
  status: string;
  zdrowie: 'healthy' | 'attention' | 'critical' | 'pending';
  odnowienie: string | null;
  cenaDetaliczna: number;
  waluta: string;
  wstrzymanaPrzezCiebie: boolean;
};
export type KlientSzczegoly = { id: string; email: string; imieNazwisko: string | null; od: string; uslugi: UslugaKlienta[] };
type Wynik<T> = { ok: true; data: T } | { ok: false; error: string };

async function wolaj<T>(path: string, init?: RequestInit): Promise<Wynik<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path, init) };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : 'Błąd połączenia z serwerem' };
  }
}

const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function fetchKlient(id: string): Promise<Wynik<KlientSzczegoly>> {
  if (!uuid(id)) return { ok: false, error: 'Nieprawidłowy klient.' };
  return wolaj<KlientSzczegoly>(`/reseller/me/clients/${id}`);
}

export async function linkHaslaKlienta(id: string): Promise<Wynik<{ mailWyslany: boolean }>> {
  if (!uuid(id)) return { ok: false, error: 'Nieprawidłowy klient.' };
  return wolaj(`/reseller/me/clients/${id}/password-link`, { method: 'POST' });
}

export async function wstrzymajUsluge(klientId: string, uslugaId: string, wznow: boolean): Promise<Wynik<KlientSzczegoly>> {
  if (!uuid(klientId) || !uuid(uslugaId)) return { ok: false, error: 'Nieprawidłowa usługa.' };
  return wolaj<KlientSzczegoly>(`/reseller/me/clients/${klientId}/service/${uslugaId}/${wznow ? 'resume' : 'suspend'}`, { method: 'POST' });
}

export async function odepnijKlienta(id: string): Promise<Wynik<{ ok: true }>> {
  if (!uuid(id)) return { ok: false, error: 'Nieprawidłowy klient.' };
  return wolaj(`/reseller/me/clients/${id}`, { method: 'DELETE' });
}

// ---- O-09 — marka ----

export async function zapiszMarke(brandName: string): Promise<Wynik<ResellerOverview>> {
  return wolaj<ResellerOverview>('/reseller/me/brand', { method: 'POST', body: JSON.stringify({ brandName }) });
}

export async function zapiszLogo(base64: string | null): Promise<Wynik<ResellerOverview>> {
  return base64 === null
    ? wolaj<ResellerOverview>('/reseller/me/logo', { method: 'DELETE' })
    : wolaj<ResellerOverview>('/reseller/me/logo', { method: 'POST', body: JSON.stringify({ base64 }) });
}
