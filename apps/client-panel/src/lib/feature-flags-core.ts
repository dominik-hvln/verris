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
  // VPS: sam przełącznik build-time, bez flagi operatora — flaga nic by nie włączyła (2026-09-23).
  if (href.startsWith('/dashboard/vps')) return clientFeatures.vps;
  const m = TRASY_MODULOW[href.split('?')[0]];
  return m ? czyModul(flagi, m) : true;
}
