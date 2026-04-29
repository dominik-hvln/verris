'use server';

import { apiFetch } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function applyReferralCodeAction(
  code: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = code.trim();
  if (trimmed.length < 4) return { error: 'Wpisz kod polecenia.' };
  try {
    await apiFetch('/users/me/referral', {
      method: 'PATCH',
      body: JSON.stringify({ code: trimmed }),
    });
    revalidatePath('/dashboard/eco');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zapisać kodu.' };
  }
}

export async function redeemEcoPointsAction(
  points: number,
): Promise<{ ok: true; creditedAmount: string } | { error: string }> {
  if (!Number.isInteger(points) || points < 100) {
    return { error: 'Minimalna wymiana to 100 punktów EKO.' };
  }
  try {
    const res = await apiFetch<{ ok: true; creditedAmount: string }>('/users/me/eco-redeem', {
      method: 'PATCH',
      body: JSON.stringify({ points }),
    });
    revalidatePath('/dashboard/eco');
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard');
    return { ok: true, creditedAmount: res.creditedAmount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się wymienić punktów.' };
  }
}
