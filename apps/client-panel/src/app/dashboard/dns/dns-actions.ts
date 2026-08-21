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
 * Edit = create the new record first, then delete the old one only if the
 * create succeeded — so a failure never loses the existing record.
 */
export async function editDnsRecordAction(input: {
  serviceId: string;
  domain: string;
  old: { name: string; type: string; value: string };
  next: { name: string; type: string; value: string; ttl?: number };
}): Promise<DnsResult> {
  const created = await createDnsRecordAction({ serviceId: input.serviceId, domain: input.domain, ...input.next });
  if (!created.ok) return created;
  // Only delete the old if something actually changed.
  const unchanged =
    input.old.name === input.next.name &&
    input.old.type === input.next.type &&
    input.old.value === input.next.value;
  if (!unchanged) {
    await deleteDnsRecordAction({ serviceId: input.serviceId, domain: input.domain, ...input.old });
  }
  revalidatePath('/dashboard/dns');
  return { ok: true };
}
