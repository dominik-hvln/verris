'use server';

import { DomainDto } from "@verris/contracts";
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

export async function registerDomainClientAction(input: {
  name: string;
  years: number;
  nameservers: string[];
}) {
  await apiFetch('/domains/registrar/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  revalidatePath('/dashboard/domains');
  revalidatePath('/dashboard/domains/buy');
}

export async function registerDomainAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim().toLowerCase();
  const years = Number.parseInt(String(formData.get('years') ?? '1'), 10);
  const nameservers = String(formData.get('nameservers') ?? '')
    .split(/\s|,/)
    .map((x) => x.trim())
    .filter(Boolean);
  await apiFetch('/domains/registrar/register', {
    method: 'POST',
    body: JSON.stringify({ name, years, nameservers }),
  });
  revalidatePath('/dashboard/domains');
  revalidatePath('/dashboard/domains/buy');
}

export async function transferDomainAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim().toLowerCase();
  const authCode = String(formData.get('authCode') ?? '').trim();
  const years = Number.parseInt(String(formData.get('years') ?? '1'), 10);
  const nameservers = String(formData.get('nameservers') ?? '')
    .split(/\s|,/)
    .map((x) => x.trim())
    .filter(Boolean);
  await apiFetch('/domains/registrar/transfer', {
    method: 'POST',
    body: JSON.stringify({ name, authCode, years, nameservers }),
  });
  revalidatePath('/dashboard/domains/buy');
}

