'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

type Result = { ok: true } | { error: string };
const msg = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : 'Nie udało się.');

/** A-25 — ręczne zawieszenie usługi (konto w DirectAdminie też zostaje zawieszone). */
export async function suspendSubscriptionAction(id: string, reason: string, note: string): Promise<Result> {
  try {
    await adminApi(`/admin/subscriptions/${id}/suspend`, { method: 'POST', body: { reason, note: note.trim() || undefined } });
    revalidatePath(`/subscriptions/${id}`);
    return { ok: true };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** A-26 — odwieszenie; opcjonalnie od razu obciąża odnowienie okresu. */
export async function unsuspendSubscriptionAction(id: string, note: string, chargeRenewal: boolean): Promise<Result> {
  try {
    await adminApi(`/admin/subscriptions/${id}/unsuspend`, {
      method: 'POST',
      body: { note: note.trim() || undefined, chargeRenewal },
    });
    revalidatePath(`/subscriptions/${id}`);
    return { ok: true };
  } catch (e) {
    return { error: msg(e) };
  }
}
