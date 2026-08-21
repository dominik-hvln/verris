'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** O-1 — convert a running free trial to a paid wallet subscription. */
export async function convertTrialAction(
  subscriptionId: string,
  immediatePerformanceConsent: boolean,
): Promise<ActionResult> {
  try {
    await apiFetch(`/subscriptions/${subscriptionId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ immediatePerformanceConsent }),
    });
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Nie udało się przekształcić usługi na płatną';
    return { ok: false, error: message };
  }
}

export async function retrySubscriptionPaymentAction(
  subscriptionId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const data = await apiFetch<{ url: string }>(
      `/subscriptions/${subscriptionId}/payment-retry`,
      { method: 'POST' },
    );
    return { ok: true, data };
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Nie udało się pobrać linku do płatności';
    return { ok: false, error: message };
  }
}

export async function abandonUnpaidSubscriptionAction(
  subscriptionId: string,
): Promise<ActionResult> {
  return cancelSubscriptionAction(subscriptionId, { atPeriodEnd: false });
}

export async function cancelSubscriptionAction(
  subscriptionId: string,
  opts: { atPeriodEnd?: boolean } = {},
): Promise<ActionResult> {
  try {
    await apiFetch(`/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      body: JSON.stringify({ atPeriodEnd: opts.atPeriodEnd ?? true }),
    });
    revalidatePath('/dashboard/services');
    revalidatePath(`/dashboard/services/${subscriptionId}`);
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Nie udało się anulować usługi';
    return { ok: false, error: message };
  }
}
