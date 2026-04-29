/**
 * Wallet & billing DTO shapes shared between API and panels.
 */

export type WalletTxType =
  | 'TOPUP'
  | 'REFUND'
  | 'CHARGE_SUBSCRIPTION'
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

export interface WalletSummaryDto {
  balance: string;
  currency: string;
  totalTopupLast30d: string;
  totalChargesLast30d: string;
  recentTransactions: WalletTransactionDto[];
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
}

export interface CreateCheckoutSessionResponse {
  url: string;
  sessionId: string;
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
