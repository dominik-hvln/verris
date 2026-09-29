'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

type DnsResult = { ok: true } | { ok: false; error: string };

function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

export interface DnsRecordInput {
  serviceId: string;
  domain: string;
  name: string;
  type: string;
  value: string;
  ttl?: number;
}

export async function createDnsRecordAction(input: DnsRecordInput): Promise<DnsResult> {
  try {
    await apiFetch(`/services/${input.serviceId}/hosting-dns`, {
      method: 'POST',
      body: JSON.stringify({
        domain: input.domain,
        name: input.name,
        type: input.type,
        value: input.value,
        ttl: input.ttl,
      }),
    });
    revalidatePath('/dashboard/dns');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function deleteDnsRecordAction(input: {
  serviceId: string;
  domain: string;
  name: string;
  type: string;
  value: string;
}): Promise<DnsResult> {
  try {
    await apiFetch(`/services/${input.serviceId}/hosting-dns`, {
      method: 'DELETE',
      body: JSON.stringify({
        domain: input.domain,
        name: input.name,
        type: input.type,
        value: input.value,
      }),
    });
    revalidatePath('/dashboard/dns');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/**
 * Zmiana rekordu jednym poleceniem po stronie API (DA action=edit) — także samego TTL. Dawne „dodaj nowy,
 * usuń stary” przy zmianie TTL nic nie zmieniało, a nieudane usunięcie zostawiało duplikat bez komunikatu.
 */
export async function editDnsRecordAction(input: {
  serviceId: string;
  domain: string;
  old: { name: string; type: string; value: string };
  next: { name: string; type: string; value: string; ttl?: number };
}): Promise<DnsResult> {
  try {
    await apiFetch(`/services/${input.serviceId}/hosting-dns`, {
      method: 'PUT',
      body: JSON.stringify({ domain: input.domain, old: input.old, next: input.next }),
    });
    revalidatePath('/dashboard/dns');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
