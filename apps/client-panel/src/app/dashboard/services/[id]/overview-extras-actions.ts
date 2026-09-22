'use server';

import type { WalletSummaryDto } from '@verris/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import type { AutoscalingHistoryDto } from './autoscaling/data';

/**
 * PB-15 — dane do boxów widoku usługi (płatności, portfel, autoskalowanie).
 * Każde źródło może zawieść osobno: box pokazuje wtedy „—", a nie zmyślone liczby.
 */
export interface OverviewExtras {
  wallet: { balance: string; currency: string } | null;
  lastPayment: { amount: string; currency: string; createdAt: string } | null;
  autoscaling: {
    enabled: boolean;
    maxCost: number;
    spend30d: number;
    currency: string;
    disabledReason: string | null;
  } | null;
}

export async function fetchOverviewExtrasAction(serviceId: string): Promise<OverviewExtras> {
  const [wallet, history] = await Promise.all([
    apiFetch<WalletSummaryDto>('/billing/wallet').catch(() => null),
    apiFetch<AutoscalingHistoryDto>(`/subscriptions/${serviceId}/autoscaling/history`).catch(() => null),
  ]);
  const paid = wallet?.recentTransactions.find(
    (t) => t.subscriptionId === serviceId && t.type === 'CHARGE_SUBSCRIPTION' && t.status === 'COMPLETED',
  );
  return {
    wallet: wallet ? { balance: wallet.balance, currency: wallet.currency } : null,
    lastPayment: paid ? { amount: paid.amount.replace('-', ''), currency: paid.currency, createdAt: paid.createdAt } : null,
    autoscaling: history
      ? {
          enabled: history.subscription.autoscalingEnabled,
          maxCost: Number.parseFloat(history.subscription.autoscalingMaxCost) || 0,
          spend30d: Number.parseFloat(history.last30dSpend) || 0,
          currency: history.currency,
          disabledReason: history.subscription.autoscalingDisabledReason,
        }
      : null,
  };
}

/** Przełącznik z widoku usługi. API zachowuje limit i wybrane zasoby (przy pierwszym włączeniu: wszystkie). */
export async function toggleAutoscalingAction(
  serviceId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/subscriptions/${serviceId}/autoscaling`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Nie udało się zapisać.';
    return { ok: false, error: msg };
  }
}
