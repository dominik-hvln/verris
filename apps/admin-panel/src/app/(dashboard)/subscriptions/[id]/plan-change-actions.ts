'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/api';

export type PlanChangePreview = {
  direction: string;
  amountDue: string;
  amountCredit: string;
  currency: string;
  resetsAutoscalingDeltas: boolean;
  targetPlans: Array<{
    id: string;
    name: string;
    slug: string;
    priceForInterval: string;
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
  }>;
};

export async function previewAdminPlanChangeAction(
  subscriptionId: string,
  targetPlanId: string,
  targetInterval?: 'MONTH' | 'YEAR',
): Promise<{ ok: true; data: PlanChangePreview } | { error: string }> {
  try {
    const data = await adminApi<PlanChangePreview>(
      `/admin/subscriptions/${subscriptionId}/plan/preview`,
      {
        method: 'POST',
        body: {
          targetPlanId,
          ...(targetInterval ? { targetInterval } : {}),
        },
      },
    );
    return { ok: true, data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się obliczyć podglądu.' };
  }
}

export async function changeAdminPlanAction(input: {
  subscriptionId: string;
  targetPlanId: string;
  reason: string;
  skipBilling?: boolean;
  targetInterval?: 'MONTH' | 'YEAR';
}): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi(`/admin/subscriptions/${input.subscriptionId}/plan`, {
      method: 'POST',
      body: {
        targetPlanId: input.targetPlanId,
        reason: input.reason,
        skipBilling: input.skipBilling ?? false,
        ...(input.targetInterval ? { targetInterval: input.targetInterval } : {}),
      },
    });
    revalidatePath(`/subscriptions/${input.subscriptionId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zmienić planu.' };
  }
}
