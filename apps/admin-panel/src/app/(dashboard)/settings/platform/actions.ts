'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type PlatformSettingsForm = {
  ecoPointsPerTree: number;
  ecoBadgeImpressionsPerPoint: number;
  ecoPointsPer10Credits: number;
  clientIdleSessionMinutes: number;
  staffIdleSessionMinutes: number;
  adminIdleSessionMinutes: number;
};

export async function fetchPlatformSettings(): Promise<PlatformSettingsForm> {
  return adminApi<PlatformSettingsForm>('/admin/platform-settings');
}

// UX-3 — oferta okresu próbnego
export type TrialOfferForm = {
  freeEnabled: boolean;
  cardEnabled: boolean;
  annualDiscountPct: number;
  monthlyDiscountPct: number;
  annualPromoCode: string;
  monthlyPromoCode: string;
  introDiscountPeriods: number;
};

export async function fetchTrialOffer(): Promise<TrialOfferForm> {
  return adminApi<TrialOfferForm>('/admin/platform-settings/trial-offer');
}

export async function updateTrialOfferAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const payload: TrialOfferForm = {
    freeEnabled: formData.get('freeEnabled') === 'on',
    cardEnabled: formData.get('cardEnabled') === 'on',
    annualDiscountPct: Number(formData.get('annualDiscountPct')),
    monthlyDiscountPct: Number(formData.get('monthlyDiscountPct')),
    annualPromoCode: String(formData.get('annualPromoCode') ?? '').trim(),
    monthlyPromoCode: String(formData.get('monthlyPromoCode') ?? '').trim(),
    introDiscountPeriods: Math.max(1, Number(formData.get('introDiscountPeriods')) || 1),
  };
  try {
    await adminApi('/admin/platform-settings/trial-offer', { method: 'PATCH', body: payload });
    revalidatePath('/settings/platform');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się zapisać oferty trialu.',
    };
  }
}

// MON-3 — ustawienia monitoringu strony (interwały + cena płatnego)
export type MonitoringSettingsForm = {
  freeIntervalMinutes: number;
  paidIntervalMinutes: number;
  paidMonthlyPrice: number;
  paidOffered: boolean;
};

export async function fetchMonitoringSettings(): Promise<MonitoringSettingsForm> {
  return adminApi<MonitoringSettingsForm>('/admin/platform-settings/monitoring');
}

export async function updateMonitoringSettingsAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const payload: MonitoringSettingsForm = {
    freeIntervalMinutes: Math.max(1, Number(formData.get('freeIntervalMinutes')) || 30),
    paidIntervalMinutes: Math.max(1, Number(formData.get('paidIntervalMinutes')) || 1),
    paidMonthlyPrice: Math.max(0, Number(formData.get('paidMonthlyPrice')) || 0),
    paidOffered: formData.get('paidOffered') === 'on',
  };
  try {
    await adminApi('/admin/platform-settings/monitoring', { method: 'PATCH', body: payload });
    revalidatePath('/settings/platform');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się zapisać ustawień monitoringu.',
    };
  }
}

// #11 — polityka kredytów SLA (progi §15, rozliczenie miesięczne)
export type SlaCreditPolicyForm = {
  enabled: boolean;
  graceMinutes: number;
  maintenanceCapMinutes: number;
};

export async function fetchSlaCreditPolicy(): Promise<SlaCreditPolicyForm> {
  return adminApi<SlaCreditPolicyForm>('/admin/platform-settings/sla-credits');
}

export async function updateSlaCreditPolicyAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const payload: SlaCreditPolicyForm = {
    enabled: formData.get('enabled') === 'on',
    graceMinutes: Math.max(0, Number(formData.get('graceMinutes')) || 0),
    maintenanceCapMinutes: Math.max(0, Number(formData.get('maintenanceCapMinutes')) || 0),
  };
  try {
    await adminApi('/admin/platform-settings/sla-credits', { method: 'PATCH', body: payload });
    revalidatePath('/settings/platform');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się zapisać polityki SLA.',
    };
  }
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
    await adminApi('/admin/platform-settings', {
      method: 'PATCH',
      body: payload,
    });
    revalidatePath('/settings/platform');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się zapisać ustawień.',
    };
  }
}
