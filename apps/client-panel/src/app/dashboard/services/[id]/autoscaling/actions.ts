'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export interface UpdateAutoscalingState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function updateAutoscalingAction(
  subscriptionId: string,
  _prevState: UpdateAutoscalingState,
  formData: FormData,
): Promise<UpdateAutoscalingState> {
  const enabled = formData.get('enabled') === 'on';
  const rawCap = formData.get('maxMonthlyCost');
  const cap =
    typeof rawCap === 'string' && rawCap.trim() !== '' ? Number.parseFloat(rawCap) : undefined;

  if (cap !== undefined && (Number.isNaN(cap) || cap < 0 || cap > 99_999.99)) {
    return { ok: false, error: 'Limit miesięczny musi być liczbą z zakresu 0–99 999,99 K (1 zł = 1 K).' };
  }

  try {
    await apiFetch(`/subscriptions/${subscriptionId}/autoscaling`, {
      method: 'PATCH',
      body: JSON.stringify({
        enabled,
        maxMonthlyCost: cap,
      }),
    });
    revalidatePath(`/dashboard/services/${subscriptionId}/autoscaling`);
    return {
      ok: true,
      message: enabled
        ? 'Autoskalowanie zostało włączone.'
        : 'Autoskalowanie zostało wyłączone.',
    };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się zapisać ustawień autoskalowania.' };
  }
}
