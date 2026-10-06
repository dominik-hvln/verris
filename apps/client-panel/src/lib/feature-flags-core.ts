import type { FlagaModulu } from '@verris/contracts';
import { clientFeatures } from './client-features';

const ENV: Record<FlagaModulu, boolean> = {
  'modul.eco': clientFeatures.eco,
  'modul.referral': clientFeatures.referral,
  'modul.iam': clientFeatures.iam,
};

/** N-12 — moduł widoczny: przełącznik build-time ORAZ flaga operatora (brak flagi = włączony). */
export function czyModul(flagi: Record<string, boolean>, modul: FlagaModulu): boolean {
  return ENV[modul] && flagi[modul] !== false;
}

/** Trasa modułu → flaga (menu, kafelki, paleta poleceń). */
export const TRASY_MODULOW: Record<string, FlagaModulu> = {
  '/dashboard/eco': 'modul.eco',
  '/dashboard/referral': 'modul.referral',
  '/dashboard/iam': 'modul.iam',
};

export function trasaWidoczna(flagi: Record<string, boolean>, href: string): boolean {
  // VPS: wynik z env API dla konta (`vps` w /me/feature-flags; FEATURE_VPS / FEATURE_VPS_TYLKO_KONTA).
  if (href.startsWith('/dashboard/vps')) return flagi.vps === true;
  if (href.startsWith('/dashboard/email-marketing')) return clientFeatures.emailMarketing;
  const m = TRASY_MODULOW[href.split('?')[0]];
  return m ? czyModul(flagi, m) : true;
}
