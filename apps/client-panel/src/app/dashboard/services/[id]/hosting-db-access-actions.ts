'use server';

import { apiFetch, ApiError } from '@/lib/api';

type Result = { ok: true } | { ok: false; error: string };
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

export async function fetchDbAccessHostsAction(
  subscriptionId: string,
  db: string,
): Promise<{ hosts: string[]; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-db-access-hosts?db=${encodeURIComponent(db)}`);
}

export async function addDbAccessHostAction(input: { subscriptionId: string; db: string; host: string }): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-db-access-hosts`, {
      method: 'POST',
      body: JSON.stringify({ db: input.db, host: input.host }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function removeDbAccessHostAction(input: { subscriptionId: string; db: string; host: string }): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-db-access-hosts/remove`, {
      method: 'POST',
      body: JSON.stringify({ db: input.db, host: input.host }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
