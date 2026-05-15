import type {
  SavedPaymentMethodDto,
  WalletAutoTopupSettingsDto,
  WalletSummaryDto,
} from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function getWalletSummary(): Promise<WalletSummaryDto> {
  return apiFetch<WalletSummaryDto>('/billing/wallet');
}

export async function getWalletAutoTopup(): Promise<WalletAutoTopupSettingsDto> {
  return apiFetch<WalletAutoTopupSettingsDto>('/billing/wallet/auto-topup');
}

export async function getSavedPaymentMethods(): Promise<SavedPaymentMethodDto[]> {
  return apiFetch<SavedPaymentMethodDto[]>('/billing/payment-methods');
}
