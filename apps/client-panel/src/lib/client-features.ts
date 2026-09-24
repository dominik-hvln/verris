/**
 * Client panel feature gates (Sprint B).
 * EKO + program partnerski są LIVE — domyślnie włączone; wyłącz jawnie przez `=false`.
 * IAM (subkonta) jest LIVE — domyślnie włączone; wyłącz jawnie przez `=false`.
 */
export type ClientFeature = 'eco' | 'iam' | 'referral' | 'vps';

/**
 * Wartość przekazywana z LITERALNEGO `process.env.NEXT_PUBLIC_…`. Next podstawia w buildzie
 * wyłącznie literalne odwołania; odczyt przez nawias z nazwą zmiennej w komponencie klienckim
 * dawał w przeglądarce zawsze wartość domyślną — menu (layout, komponent kliencki)
 * ignorowało flagę operatora, a render serwera ją respektował.
 */
function envFlag(v: string | undefined, defaultWhenUnset: boolean): boolean {
  if (v === undefined || v === '') return defaultWhenUnset;
  if (v === 'false' || v === '0') return false;
  return v === 'true' || v === '1';
}

export function isClientFeatureEnabled(feature: ClientFeature): boolean {
  switch (feature) {
    case 'eco':
      return envFlag(process.env.NEXT_PUBLIC_FEATURE_ECO, true);
    case 'referral':
      return envFlag(process.env.NEXT_PUBLIC_FEATURE_REFERRAL, true);
    case 'iam':
      return envFlag(process.env.NEXT_PUBLIC_FEATURE_IAM, true);
    // Decyzja właściciela 2026-09-23: VPS ukryty do czasu wejścia do sprzedaży (strona pokazywała
    // tylko „chwilowo niedostępne”). Włączenie: NEXT_PUBLIC_FEATURE_VPS=true przy buildzie panelu.
    case 'vps':
      return envFlag(process.env.NEXT_PUBLIC_FEATURE_VPS, false);
    default:
      return false;
  }
}

export const clientFeatures = {
  eco: isClientFeatureEnabled('eco'),
  iam: isClientFeatureEnabled('iam'),
  referral: isClientFeatureEnabled('referral'),
  vps: isClientFeatureEnabled('vps'),
} as const;
