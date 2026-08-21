'use server';

import { redirect } from 'next/navigation';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResponse,
  PreviewTopupPromoInput,
  PreviewTopupPromoResponse,
  PromoRedeemSuccessDto,
  WalletAutoTopupSettingsDto,
} from '@verris/contracts';
import { ApiError, apiFetch } from '@/lib/api';

export interface TopupResult {
  ok: boolean;
  error?: string;
}

export type PromoRedeemResult =
  | { ok: true; amountPln: string; code: string }
  | { ok: false; error: string };

export type AutoTopupResult =
  | { ok: true; settings: WalletAutoTopupSettingsDto }
  | { ok: false; error: string };

const MIN_TOPUP = 5;
const MAX_TOPUP = 10_000;

export async function startTopupAction(formData: FormData): Promise<TopupResult> {
  const raw = formData.get('amount');
  const parsed = typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN;

  if (Number.isNaN(parsed) || parsed < MIN_TOPUP || parsed > MAX_TOPUP) {
    return {
      ok: false,
      error: `Podaj kwotę z zakresu ${MIN_TOPUP}–${MAX_TOPUP} PLN.`,
    };
  }

  const promoRaw = formData.get('promoCode');
  const promoCode =
    typeof promoRaw === 'string' && promoRaw.trim().length > 0 ? promoRaw.trim() : null;

  const input: CreateCheckoutSessionInput = {
    amount: parsed.toFixed(2),
    promoCode,
  };
  let response: CreateCheckoutSessionResponse;
  try {
    response = await apiFetch<CreateCheckoutSessionResponse>('/billing/checkout-session', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się przygotować płatności.',
    };
  }

  redirect(response.url);
}

export type PreviewPromoResult =
  | { ok: true; preview: PreviewTopupPromoResponse }
  | { ok: false; error: string };

export async function previewTopupPromoAction(
  amount: string,
  promoCode: string,
): Promise<PreviewPromoResult> {
  const trimmedCode = promoCode.trim();
  const parsed = Number.parseFloat(amount);
  if (Number.isNaN(parsed) || parsed < MIN_TOPUP || parsed > MAX_TOPUP) {
    return { ok: false, error: `Podaj kwotę z zakresu ${MIN_TOPUP}–${MAX_TOPUP} PLN.` };
  }
  if (trimmedCode.length < 3) {
    return { ok: false, error: 'Wpisz kod promocyjny (min. 3 znaki).' };
  }

  const input: PreviewTopupPromoInput = { amount: parsed.toFixed(2), promoCode: trimmedCode };
  try {
    const preview = await apiFetch<PreviewTopupPromoResponse>(
      '/billing/checkout-session/preview-promo',
      { method: 'POST', body: JSON.stringify(input) },
    );
    return { ok: true, preview };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się sprawdzić kodu promocyjnego.',
    };
  }
}

export async function redeemPromoAction(formData: FormData): Promise<PromoRedeemResult> {
  const raw = formData.get('code');
  const code = typeof raw === 'string' ? raw.trim() : '';
  if (code.length < 3) {
    return { ok: false, error: 'Wpisz kod promocyjny (min. 3 znaki).' };
  }

  try {
    const out = await apiFetch<PromoRedeemSuccessDto>('/billing/promo/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    return { ok: true, amountPln: out.amountPln, code: out.code };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się zrealizować kodu.',
    };
  }
}

export async function upsertAutoTopupAction(formData: FormData): Promise<AutoTopupResult> {
  const enabled = formData.get('enabled') === 'on';
  const thresholdRaw = formData.get('thresholdPln');
  const topupRaw = formData.get('topupAmountPln');
  const pmRaw = formData.get('localPaymentMethodId');

  const thresholdPln = typeof thresholdRaw === 'string' ? thresholdRaw.trim() : '';
  const topupAmountPln = typeof topupRaw === 'string' ? topupRaw.trim() : '';
  const localPaymentMethodId =
    typeof pmRaw === 'string' && pmRaw.length > 0 ? pmRaw : null;

  if (!thresholdPln || !topupAmountPln) {
    return { ok: false, error: 'Uzupełnij próg salda i kwotę doładowania.' };
  }

  try {
    const settings = await apiFetch<WalletAutoTopupSettingsDto>('/billing/wallet/auto-topup', {
      method: 'POST',
      body: JSON.stringify({
        enabled,
        thresholdPln,
        topupAmountPln,
        localPaymentMethodId,
      }),
    });
    return { ok: true, settings };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się zapisać ustawień.',
    };
  }
}
