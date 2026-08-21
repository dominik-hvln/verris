'use server';

import { apiFetch } from '@/lib/api';
import { revalidatePath } from 'next/cache';

type PreferencesResponse = {
  ecoDaSync?: { adjusted: number; notice: string | null };
  ecoPointsAwarded?: boolean;
};

export async function patchSubscriptionEcoMode(
  subscriptionId: string,
  ecoModeEnabled: boolean,
): Promise<{ ok: true; ecoDaNotice?: string | null; ecoPointsAwarded?: boolean } | { error: string }> {
  try {
    const res = await apiFetch<PreferencesResponse>(`/subscriptions/${subscriptionId}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify({ ecoModeEnabled }),
    });
    revalidatePath(`/dashboard/services/${subscriptionId}/autoscaling`);
    revalidatePath(`/dashboard/services/${subscriptionId}`);
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/eco');
    revalidatePath('/dashboard');
    return {
      ok: true,
      ecoDaNotice: res.ecoDaSync?.notice ?? null,
      ecoPointsAwarded: res.ecoPointsAwarded,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Nie udało się zapisać trybu EKO.',
    };
  }
}
