import type {
  ProformaDto,
  SavedPaymentMethodDto,
  StatusPlatnosciPaynowDto,
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

/** K4 — proformy wystawione przez obsługę. */
export async function getProformy(): Promise<ProformaDto[]> {
  return (await apiFetch<{ rows: ProformaDto[] }>('/billing/proformy')).rows;
}

/**
 * Po powrocie z Paynow: status płatności; gdy powiadomienie jeszcze nie dotarło, API pyta Paynow
 * i księguje (idempotentnie). `null` przy błędzie — strona pokaże „czekamy na potwierdzenie”.
 */
export async function sprawdzPlatnoscPaynow(id: string): Promise<StatusPlatnosciPaynowDto | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return await apiFetch<StatusPlatnosciPaynowDto>(`/billing/paynow/${id}/sprawdz`, { method: 'POST' });
  } catch {
    return null;
  }
}
