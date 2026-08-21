'use server';

import { revalidatePath } from 'next/cache';
import { staffApi } from '@/lib/staff-api';

export async function staffPreviewPlanChangeAction(
  subscriptionId: string,
  targetPlanId: string,
) {
  try {
    const data = await staffApi<{
      direction: string;
      amountDue: string;
      amountCredit: string;
      currency: string;
      resetsAutoscalingDeltas: boolean;
    }>(`/admin/subscriptions/${subscriptionId}/plan/preview`, {
      method: 'POST',
      body: { targetPlanId },
    });
    return { ok: true as const, data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Podgląd nie powiódł się.' };
  }
}

export async function staffChangePlanAction(input: {
  subscriptionId: string;
  userId: string;
  targetPlanId: string;
  reason: string;
}) {
  try {
    await staffApi(`/admin/subscriptions/${input.subscriptionId}/plan`, {
      method: 'POST',
      body: {
        targetPlanId: input.targetPlanId,
        reason: input.reason,
        skipBilling: false,
      },
    });
    revalidatePath(`/crm/${input.userId}/subscriptions/${input.subscriptionId}`);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Zmiana planu nie powiodła się.' };
  }
}
