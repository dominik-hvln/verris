'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export type PlatformSettingsForm = {
  ecoPointsPerTree: number;
  ecoBadgeImpressionsPerPoint: number;
  ecoPointsPer10Credits: number;
  clientIdleSessionMinutes: number;
  staffIdleSessionMinutes: number;
  adminIdleSessionMinutes: number;
};

export async function fetchPlatformSettings(): Promise<PlatformSettingsForm> {
  return apiFetch<PlatformSettingsForm>('/admin/platform-settings');
}

export async function updatePlatformSettingsAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const payload: PlatformSettingsForm = {
    ecoPointsPerTree: Number(formData.get('ecoPointsPerTree')),
    ecoBadgeImpressionsPerPoint: Number(formData.get('ecoBadgeImpressionsPerPoint')),
    ecoPointsPer10Credits: Number(formData.get('ecoPointsPer10Credits')),
    clientIdleSessionMinutes: Number(formData.get('clientIdleSessionMinutes')),
    staffIdleSessionMinutes: Number(formData.get('staffIdleSessionMinutes')),
    adminIdleSessionMinutes: Number(formData.get('adminIdleSessionMinutes')),
  };

  try {
    await apiFetch('/admin/platform-settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    revalidatePath('/settings/platform');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się zapisać ustawień.',
    };
  }
}
