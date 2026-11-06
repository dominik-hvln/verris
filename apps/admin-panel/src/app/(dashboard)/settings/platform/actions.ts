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

// UX-3 — oferta okresu próbnego; decyzja 6.11.2026 — kredyty na autoskalowanie zamiast rabatu na start.
export type TrialOfferForm = {
  freeEnabled: boolean;
  cardEnabled: boolean;
  /** Zł brutto przy pierwszym zakupie planu rocznego. */
  annualAutoscalingCredit: number;
  /** Zł brutto przy pierwszym zakupie planu miesięcznego. */
  monthlyAutoscalingCredit: number;
  /** Tylko odczyt — ważność kredytów (miesiące). */
  autoscalingCreditValidityMonths?: number;
};

export async function fetchTrialOffer(): Promise<TrialOfferForm> {
  return adminApi<TrialOfferForm>('/admin/platform-settings/trial-offer');
}

/** Kwota z pola formularza: całe złote 0–1000 (jak walidacja API). */
function kwotaKredytu(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(String(v ?? '').replace(',', '.')));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1000) : 0;
}

export async function updateTrialOfferAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const payload: TrialOfferForm = {
    freeEnabled: formData.get('freeEnabled') === 'on',
    cardEnabled: formData.get('cardEnabled') === 'on',
    annualAutoscalingCredit: kwotaKredytu(formData.get('annualAutoscalingCredit')),
    monthlyAutoscalingCredit: kwotaKredytu(formData.get('monthlyAutoscalingCredit')),
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

export interface SlaPodglad {
  okres: string;
  suma: string;
  pozycje: {
    subscriptionId: string;
    domain: string | null;
    planName: string | null;
    dostepnosc: string;
    progProcent: number;
    przestojMin: number;
    konserwacjaMin: number;
    kwota: string;
    waluta: string;
  }[];
}

/** N-16 — co zostałoby przyznane za poprzedni miesiąc (bez zapisu). */
export async function fetchSlaPodglad(): Promise<SlaPodglad | null> {
  try {
    return await adminApi<SlaPodglad>('/admin/sla/podglad');
  } catch {
    return null;
  }
}

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
