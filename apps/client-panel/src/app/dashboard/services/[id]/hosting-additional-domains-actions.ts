'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type AdditionalDomainRow = { domain: string; isPrimary: boolean };
type Result = { ok: true } | { ok: false; error: string };
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

export async function fetchAdditionalDomainsAction(
  subscriptionId: string,
): Promise<{ rows: AdditionalDomainRow[]; primary: string | null; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-additional-domains`);
}

export async function createAdditionalDomainAction(input: {
  subscriptionId: string;
  domain: string;
}): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-additional-domains`, {
      method: 'POST',
      body: JSON.stringify({ domain: input.domain }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function deleteAdditionalDomainAction(subscriptionId: string, domain: string): Promise<Result> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-additional-domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/* ===================== PANEL-5: aliasy domeny (pointers) ===================== */
export type DomainPointerRow = { alias: string; type: string };
export async function fetchDomainPointersAction(
  subscriptionId: string,
): Promise<{ rows: DomainPointerRow[]; primary: string | null; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-domain-pointers`);
}

export async function createDomainPointerAction(input: { subscriptionId: string; alias: string }): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-domain-pointers`, {
      method: 'POST',
      body: JSON.stringify({ alias: input.alias }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function deleteDomainPointerAction(subscriptionId: string, alias: string): Promise<Result> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-domain-pointers/${encodeURIComponent(alias)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
