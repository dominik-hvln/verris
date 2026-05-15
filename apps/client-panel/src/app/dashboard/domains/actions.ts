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

