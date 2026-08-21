'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';
import type { PlanChangePreviewDto, PlanChangeResultDto } from '@verris/contracts';

export interface PlanChangeActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function previewPlanChangeAction(
  subscriptionId: string,
  targetPlanId: string,
  targetInterval?: 'MONTH' | 'YEAR',
): Promise<{ ok: true; data: PlanChangePreviewDto } | { ok: false; error: string }> {
  try {
    const data = await apiFetch<PlanChangePreviewDto>(
      `/subscriptions/${subscriptionId}/plan/preview`,
      {
        method: 'POST',
        body: JSON.stringify({
          targetPlanId,
          ...(targetInterval ? { targetInterval } : {}),
        }),
      },
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się obliczyć kosztu zmiany planu.' };
  }
}

export async function changePlanAction(
  subscriptionId: string,
  _prev: PlanChangeActionState,
  formData: FormData,
): Promise<PlanChangeActionState> {
  const targetPlanId = formData.get('targetPlanId');
  if (typeof targetPlanId !== 'string' || !targetPlanId) {
    return { ok: false, error: 'Wybierz plan docelowy.' };
  }
  const targetIntervalRaw = formData.get('targetInterval');
  const targetInterval =
    targetIntervalRaw === 'MONTH' || targetIntervalRaw === 'YEAR'
      ? targetIntervalRaw
      : undefined;

  const confirmReset = formData.get('confirmReset') === 'on';
  const needsReset = formData.get('needsReset') === '1';
  if (needsReset && !confirmReset) {
    return {
      ok: false,
      error: 'Potwierdź, że rozumiesz reset delt autoskalowania przy zmianie planu.',
    };
  }

  try {
    const result = await apiFetch<PlanChangeResultDto>(
      `/subscriptions/${subscriptionId}/plan`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          targetPlanId,
          ...(targetInterval ? { targetInterval } : {}),
        }),
      },
    );
    revalidatePath(`/dashboard/services/${subscriptionId}/plan`);
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/billing');

    const msg =
      result.direction === 'upgrade' && Number(result.amountDue) > 0
        ? `Plan zmieniony. Dopłata: ${result.amountDue} ${result.currency}.`
        : result.direction === 'downgrade' && Number(result.amountCredit) > 0
          ? `Plan zmieniony. Uznanie na portfel: ${result.amountCredit} ${result.currency}.`
          : 'Plan został zmieniony.';

    return { ok: true, message: msg };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        return {
          ok: false,
          error:
            err.message ||
            'Niewystarczające saldo portfela — doładuj konto w sekcji Portfel.',
        };
      }
      return { ok: false, error: err.message };
    }
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się zmienić planu.' };
  }
}
