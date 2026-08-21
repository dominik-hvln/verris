'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type ReferralProgramStatus = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  appliedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  referralCode: string | null;
};

export async function fetchReferralProgramStatus(): Promise<ReferralProgramStatus> {
  return apiFetch<ReferralProgramStatus>('/users/me/referral-program');
}

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

/* ---- RESELL — pulpit zarobków partnera ---- */

export type PartnerOverview = {
  programEnabled: boolean;
  enrollmentStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  referralCode: string | null;
  referralLink: string | null;
  config: { commissionPct: number; holdDays: number; minPayout: number; freeHostingThreshold: number; freeHostingCredit: number };
  referrals: { total: number; paying: number };
  earnings: { pending: number; available: number; paid: number; reserved: number };
  milestone: { threshold: number; payingCount: number; achieved: number; nextAt: number | null };
  payout: { canRequestWallet: boolean; canRequestBank: boolean };
};

export type PartnerCommission = {
  id: string;
  kind: 'RECURRING_PCT' | 'MILESTONE_BONUS';
  referredUserId: string | null;
  baseAmount: string | null;
  pct: number | null;
  amount: string;
  currency: string;
  status: 'PENDING' | 'AVAILABLE' | 'PAID' | 'CANCELED';
  availableAt: string | null;
  description: string | null;
  createdAt: string;
};

export type PartnerPayout = {
  id: string;
  method: 'WALLET' | 'BANK';
  amount: string;
  currency: string;
  status: 'REQUESTED' | 'PAID' | 'REJECTED';
  bankAccount: string | null;
  requestedAt: string;
  processedAt: string | null;
};

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Wystąpił błąd.';
}

export async function fetchPartnerOverview(): Promise<PartnerOverview> {
  return apiFetch<PartnerOverview>('/partners/me/overview');
}
export async function fetchPartnerCommissions(): Promise<PartnerCommission[]> {
  return apiFetch<PartnerCommission[]>('/partners/me/commissions');
}
export async function fetchPartnerPayouts(): Promise<PartnerPayout[]> {
  return apiFetch<PartnerPayout[]>('/partners/me/payouts');
}
export async function requestWalletPayoutAction(): Promise<{ ok: boolean; error?: string; amount?: number }> {
  try {
    const r = await apiFetch<{ amount: number; payoutId: string }>('/partners/me/payouts/wallet', { method: 'POST' });
    return { ok: true, amount: r.amount };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
export async function requestBankPayoutAction(bankAccount: string): Promise<{ ok: boolean; error?: string; amount?: number }> {
  try {
    const r = await apiFetch<{ amount: number; payoutId: string }>('/partners/me/payouts/bank', {
      method: 'POST',
      body: JSON.stringify({ bankAccount }),
    });
    return { ok: true, amount: r.amount };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
