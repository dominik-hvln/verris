'use server';

import type { PreviewSubscriptionPromoInput, PreviewSubscriptionPromoResult } from '@verris/contracts';
import { ApiError, apiFetch } from '@/lib/api';

export async function previewSubscriptionPromoAction(
  input: PreviewSubscriptionPromoInput,
): Promise<{ ok: true; data: PreviewSubscriptionPromoResult } | { ok: false; error: string }> {
  try {
    const data = await apiFetch<PreviewSubscriptionPromoResult>('/subscriptions/preview-promo', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się sprawdzić kodu.',
    };
  }
}
