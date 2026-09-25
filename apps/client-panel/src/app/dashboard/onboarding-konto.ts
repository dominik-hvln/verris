import type { WalletAutoTopupSettingsDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';
import { fakturaKompletna, type KontoOnboardingu } from './onboarding-kroki';
import type { UserProfile } from './settings/actions';

/**
 * PROD-02 — dane konta do kroków „płatność” i „faktura”. Każdy błąd = `null`
 * (krok „nie wiemy”, poza procentem), nigdy „nie zrobione”. Subkonto nie widzi
 * danych do faktury, więc ten krok go nie dotyczy.
 */
export async function pobierzKontoOnboardingu(): Promise<KontoOnboardingu> {
  const [profil, auto] = await Promise.all([
    apiFetch<UserProfile>('/users/me').catch(() => null),
    apiFetch<WalletAutoTopupSettingsDto>('/billing/wallet/auto-topup').catch(() => null),
  ]);
  const saldo = profil ? Number(profil.walletBalance) : NaN;
  return {
    saldo: Number.isFinite(saldo) ? saldo : null,
    autoDoladowanie: auto ? auto.enabled : null,
    fakturaOk: profil && !profil.isSubaccount ? fakturaKompletna(profil) : null,
  };
}
