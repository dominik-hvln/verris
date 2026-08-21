'use server';

import { revalidatePath } from 'next/cache';
import type { CreateSubscriptionInput, CreateSubscriptionResponse } from '@verris/contracts';
import { ApiError, apiFetch } from '@/lib/api';

export interface CreateSubscriptionResult {
  ok: boolean;
  data?: CreateSubscriptionResponse;
  error?: string;
}

export async function createSubscriptionAction(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  try {
    const data = await apiFetch<CreateSubscriptionResponse>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard');
    return { ok: true, data };
  } catch (err) {
    const error =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Nieznany błąd';
    return { ok: false, error };
  }
}

/** O-1 — whether this account may still start a free trial. */
export async function getTrialEligibilityAction(): Promise<{ eligible: boolean; reason?: string }> {
  try {
    return await apiFetch<{ eligible: boolean; reason?: string }>(
      '/subscriptions/trial/eligibility',
    );
  } catch {
    return { eligible: false, reason: 'ERROR' };
  }
}

export interface StartTrialInput {
  planId: string;
  domain: string;
  preferredRegion?: string;
  ecoModeEnabled?: boolean;
}

/** O-1 — start a free trial (one per account). */
export async function startTrialAction(
  input: StartTrialInput,
): Promise<CreateSubscriptionResult> {
  try {
    const data = await apiFetch<CreateSubscriptionResponse>('/subscriptions/trial', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard');
    return { ok: true, data };
  } catch (err) {
    const error =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Nieznany błąd';
    return { ok: false, error };
  }
}
