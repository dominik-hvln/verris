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
