'use server';

import { apiFetch, ApiError } from '@/lib/api';

export async function applyReferralProgramAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch('/users/me/referral-program/apply', { method: 'POST' });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się wysłać zgłoszenia.',
    };
  }
}
