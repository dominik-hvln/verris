'use server';

import {
  DomainDto,
  type DomainPeriodQuotesDto,
  type DomainSearchResultDto,
} from "@verris/contracts";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function fetchUserDomains(): Promise<DomainDto[]> {
  try {
    return await apiFetch<DomainDto[]>('/domains');
  } catch (error) {
    console.error('Błąd pobierania domen:', error);
    return [];
  }
}

export async function fetchDomain(id: string): Promise<DomainDto> {
  return apiFetch<DomainDto>(`/domains/${id}`);
}

export async function addDomain(name: string): Promise<boolean> {
  await apiFetch('/domains', { method: 'POST', body: JSON.stringify({ name }) });

  revalidatePath('/dashboard/domains');
  return true;
}

export async function deleteDomain(id: string): Promise<boolean> {
  await apiFetch(`/domains/${id}`, { method: 'DELETE' });

  revalidatePath('/dashboard/domains');
  return true;
}

export async function verifyDomainAction(id: string): Promise<DomainDto> {
  const updated = await apiFetch<DomainDto>(`/domains/${id}/verify`, { method: 'POST' });
  revalidatePath('/dashboard/domains');
  revalidatePath(`/dashboard/domains/${id}`);
  return updated;
}

export interface DomainChecklistRow {
  id: string;
  hostname: string;
  status: 'PENDING' | 'OK' | 'WARNING' | 'FAILED';
  observedRecords: unknown;
  requiredRecords: unknown;
  issues: unknown;
  checkedAt: string | null;
  createdAt: string;
}

export async function fetchDomainChecklist(id: string): Promise<DomainChecklistRow[]> {
  return apiFetch<DomainChecklistRow[]>(`/domains/${id}/checklist`);
}

export async function runDomainChecklistAction(id: string): Promise<DomainChecklistRow> {
  const row = await apiFetch<DomainChecklistRow>(`/domains/${id}/checklist`, { method: 'POST' });
  revalidatePath(`/dashboard/domains/${id}`);
  revalidatePath('/dashboard/domains');
  return row;
}

export async function fetchRegistrarStatus(): Promise<{
  provider: string | null;
  configured: boolean;
}> {
  return apiFetch('/domains/registrar/status');
}

export async function checkRegistrarAvailability(name: string) {
  return apiFetch<{
    domain: string;
    available: boolean;
    premium?: boolean;
    priceAmount?: string | null;
    currency?: string;
  }>('/domains/registrar/availability', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function quoteDomainAction(name: string, years: number) {
  return apiFetch<{
    domain: string;
    available: boolean;
    premium?: boolean;
    years: number;
    priceAmount: string | null;
    currency: string;
  }>('/domains/registrar/quote', {
    method: 'POST',
    body: JSON.stringify({ name, years }),
  });
}

export async function searchDomainsAction(label: string) {
  return apiFetch<DomainSearchResultDto[]>('/domains/registrar/search', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export async function quotePeriodsAction(name: string, years: number[] = [1, 2, 3, 5, 10]) {
  return apiFetch<DomainPeriodQuotesDto>('/domains/registrar/quote-periods', {
    method: 'POST',
    body: JSON.stringify({ name, years }),
  });
}

export type RegistrarOrderRow = {
  id: string;
  domainName: string;
  type: string;
  status: string;
  provider: string | null;
  years: number;
  priceAmount: string | null;
  currency: string;
  lastError: string | null;
  createdAt: string;
  submittedAt: string | null;
  completedAt: string | null;
};

export async function fetchRegistrarOrders() {
  return apiFetch<Array<{
    id: string;
    domainName: string;
    type: string;
    status: string;
    provider: string | null;
    years: number;
    priceAmount: string | null;
    currency: string;
    lastError: string | null;
    createdAt: string;
    submittedAt: string | null;
    completedAt: string | null;
  }>>('/domains/registrar/orders');
}

/** Czy na koncie obowiązuje już oświadczenie domenowe (Regulamin §12 ust. 8). */
export async function getWaiverConsentAction(): Promise<{ granted: boolean; grantedAt: string | null }> {
  try {
    return await apiFetch<{ granted: boolean; grantedAt: string | null }>(
      '/domains/registrar/waiver-consent',
    );
  } catch {
    return { granted: false, grantedAt: null };
  }
}

/** A-13 — dane abonenta domeny (właściciela). Kształt jak RegistrantDto w API. */
export interface Abonent {
  firstName: string;
  lastName: string;
  companyName?: string | null;
  vat?: string | null;
  street: string;
  houseNumber: string;
  zipcode: string;
  city: string;
  country: string;
  phoneCountryCode: string;
  phone: string;
  email: string;
}

/** Podpowiedź danych abonenta z profilu konta (telefonu profil nie ma — klient wpisuje). */
export async function abonentZProfiluAction(): Promise<Partial<Abonent>> {
  try {
    const me = await apiFetch<{
      email?: string; firstName?: string | null; lastName?: string | null; companyName?: string | null;
      nip?: string | null; address?: string | null; city?: string | null; postalCode?: string | null; country?: string | null;
    }>('/users/me');
    // „ul. Długa 5/7” → ulica „ul. Długa”, numer „5/7” (ostatni człon z cyfrą); klient i tak widzi i poprawia.
    const adres = (me.address ?? '').trim();
    const m = /^(.*\S)\s+(\d[\w/ -]*)$/.exec(adres);
    return {
      firstName: me.firstName ?? '', lastName: me.lastName ?? '', companyName: me.companyName ?? '',
      vat: me.nip ?? '', street: m ? m[1] : adres, houseNumber: m ? m[2] : '', zipcode: me.postalCode ?? '',
      city: me.city ?? '', country: (me.country ?? 'PL').toUpperCase(), phoneCountryCode: '+48', phone: '', email: me.email ?? '',
    };
  } catch {
    return { country: 'PL', phoneCountryCode: '+48' };
  }
}

type Wynik<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const blad = (e: unknown, d: string) => ({ ok: false as const, error: e instanceof Error ? e.message : d });

export async function transferDomainClientAction(input: {
  name: string; authCode: string; years: number; nameservers: string[];
  withdrawalWaiverConsent: boolean; registrant: Abonent;
}): Promise<Wynik> {
  try {
    await apiFetch('/domains/registrar/transfer', { method: 'POST', body: JSON.stringify(input) });
    revalidatePath('/dashboard/domains/buy');
    return { ok: true };
  } catch (e) {
    return blad(e, 'Nie udało się zlecić transferu.');
  }
}

export async function abonentDomenyAction(id: string): Promise<Wynik<{ abonent: Abonent }>> {
  try {
    return { ok: true, abonent: await apiFetch<Abonent>(`/domains/${id}/registrar/registrant`) };
  } catch (e) {
    return blad(e, 'Nie udało się pobrać danych abonenta.');
  }
}

export async function zapiszAbonentaAction(id: string, abonent: Abonent): Promise<Wynik<{ abonent: Abonent }>> {
  try {
    const a = await apiFetch<Abonent>(`/domains/${id}/registrar/registrant`, { method: 'PUT', body: JSON.stringify(abonent) });
    return { ok: true, abonent: a };
  } catch (e) {
    return blad(e, 'Nie udało się zapisać danych abonenta.');
  }
}

export async function blokadaTransferuAction(id: string, locked: boolean): Promise<Wynik> {
  try {
    await apiFetch(`/domains/${id}/registrar/lock`, { method: 'POST', body: JSON.stringify({ locked }) });
    revalidatePath(`/dashboard/domains/${id}`);
    return { ok: true };
  } catch (e) {
    return blad(e, 'Nie udało się zmienić blokady transferu.');
  }
}

export async function kodTransferuAction(id: string): Promise<Wynik<{ authCode: string }>> {
  try {
    const r = await apiFetch<{ authCode: string }>(`/domains/${id}/registrar/authcode`, { method: 'POST' });
    return { ok: true, authCode: r.authCode };
  } catch (e) {
    return blad(e, 'Nie udało się pobrać kodu transferu.');
  }
}

export async function registerDomainClientAction(input: {
  name: string;
  years: number;
  nameservers: string[];
  registrant: Abonent;
  /** Oświadczenie: natychmiastowa rejestracja + utrata prawa odstąpienia (art. 38 pkt 1 upk). */
  withdrawalWaiverConsent: boolean;
}) {
  await apiFetch('/domains/registrar/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  revalidatePath('/dashboard/domains');
  revalidatePath('/dashboard/domains/buy');
}

/** A-10 — odnowienie domeny u rejestratora (cena → potwierdzenie → obciążenie portfela). */
export async function renewQuoteAction(
  id: string,
  years: number,
): Promise<{ ok: true; priceAmount: string; currency: string } | { ok: false; error: string }> {
  try {
    const q = await apiFetch<{ priceAmount: string; currency: string }>(`/domains/${id}/registrar/renew-quote`, {
      method: 'POST',
      body: JSON.stringify({ years }),
    });
    return { ok: true, priceAmount: q.priceAmount, currency: q.currency };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nie udało się pobrać ceny odnowienia.' };
  }
}

export async function renewDomainAction(id: string, years: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/domains/${id}/registrar/renew`, { method: 'POST', body: JSON.stringify({ years }) });
    revalidatePath(`/dashboard/domains/${id}`);
    revalidatePath('/dashboard/domains');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Odnowienie nie powiodło się.' };
  }
}
