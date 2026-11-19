import type { FlagaModulu } from '@verris/contracts/klient';
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
  // Paczka 131 – Kreator marki: domyślnie wyłączony w adminie (do publikacji dokumentów prawnych); `kreatorMarki`
  // z /me/feature-flags (API). Brak flagi = ukryty.
  if (href === '/dashboard/kreator-marki' || href.startsWith('/dashboard/kreator-marki/') || href.startsWith('/dashboard/kreator-marki?')) return flagi.kreatorMarki === true;
  const m = TRASY_MODULOW[href.split('?')[0]];
  return m ? czyModul(flagi, m) : true;
}
