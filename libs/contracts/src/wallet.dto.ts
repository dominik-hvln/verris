/**
 * Wallet & billing DTO shapes shared between API and panels.
 */

export type WalletTxType =
  | 'TOPUP'
  | 'REFUND'
  | 'CHARGE_SUBSCRIPTION'
  | 'CHARGE_PLAN_UPGRADE'
  | 'CREDIT_PLAN_DOWNGRADE'
  | 'CHARGE_AUTOSCALING'
  | 'CHARGE_USAGE'
  | 'ADJUSTMENT'
  | 'PROMO_CREDIT';

export type WalletTxStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface WalletTransactionDto {
  id: string;
  type: WalletTxType;
  status: WalletTxStatus;
  amount: string;
  currency: string;
  balanceAfter: string;
  description: string | null;
  paymentProvider: string | null;
  paymentRef: string | null;
  subscriptionId: string | null;
  createdAt: string;
}

/** Agregat wpływów i wydatków portfela w jednym miesiącu kalendarzowym (YYYY-MM). */
export interface WalletMonthlyFlowPointDto {
  month: string;
  label: string;
  inflow: string;
  outflow: string;
}

export interface WalletSummaryDto {
  balance: string;
  currency: string;
  totalTopupLast30d: string;
  totalChargesLast30d: string;
  recentTransactions: WalletTransactionDto[];
  /** Ostatnie 12 miesięcy (włącznie z bieżącym), tylko transakcje COMPLETED. */
  monthlyFlowLast12: WalletMonthlyFlowPointDto[];
}

export interface AdminCreditWalletInput {
  userId: string;
  /** Positive amount, in user's currency. */
  amount: number | string;
  description?: string;
  idempotencyKey?: string;
}

export interface CreateCheckoutSessionInput {
  /** Top-up amount, e.g. 50.00 */
  amount: number | string;
  /**
   * Optional percent-bonus promo code applied at checkout. Validated server
   * side (active, not expired, not redeemed yet by this user). Bonus is
   * credited AFTER Stripe pays out and the topup itself is registered.
   */
  promoCode?: string | null;
}

export interface CreateCheckoutSessionResponse {
  url: string;
  sessionId: string;
  /**
   * Set when a percent-bonus promo code was applied at checkout time. The
   * `amount` is the calculated PLN bonus (rounded to 2 decimals); the user
   * sees it as additional credits in the wallet after the payment lands.
   */
  bonus?: { amount: string; percent: number; code: string } | null;
}

/** Pre-checkout dry-run preview of a percent-bonus promo code. */
export interface PreviewTopupPromoInput {
  amount: number | string;
  promoCode: string;
}

export interface PreviewTopupPromoResponse {
  code: string;
  percent: number;
  /** Bonus amount in PLN (decimal string, 2 places). */
  bonusAmount: string;
  /** Topup + bonus, decimal string, 2 places. */
  totalCredited: string;
  description: string | null;
}

/** Zapisy Stripe w bazie (auto‑doładowanie może wskazać konkretny rekord lub null = domyślna pm w Stripe). */
export interface SavedPaymentMethodDto {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

/** Odpowiedź GET/POST `/billing/wallet/auto-topup`. */
export interface WalletAutoTopupSettingsDto {
  enabled: boolean;
  thresholdPln: string;
  topupAmountPln: string;
  currency: string;
  paymentMethodId: string | null;
  cooldownUntil: string | null;
  lastAttemptAt: string | null;
  lastAttemptOk: boolean | null;
  lastAttemptError: string | null;
  totalToppedUpAmountPln?: string;
  totalToppedUpCount?: number;
}

/** Odpowiedź POST `/billing/promo/redeem`. */
export interface PromoRedeemSuccessDto {
  redeemed: boolean;
  amountPln: string;
  walletTxId: string;
  code: string;
}
