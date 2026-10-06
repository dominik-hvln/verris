/**
 * Client panel feature gates (Sprint B).
 * EKO + program partnerski są LIVE — domyślnie włączone; wyłącz jawnie przez `=false`.
 * IAM (subkonta) jest LIVE — domyślnie włączone; wyłącz jawnie przez `=false`.
 * VPS i narzut resellera NIE są tutaj (2026-10-06): obraz panelu budowany jest w CI bez argumentów
 * NEXT_PUBLIC_FEATURE_*, więc włącza je API per konto — `vps` / `resellerMarkup` w /me/feature-flags
 * (useFlagi() w komponentach klienckich, pobierzFlagiAction() w serwerowych).
 */
export type ClientFeature = 'eco' | 'iam' | 'referral' | 'emailMarketing';

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
    // Decyzja właściciela 2026-09-28: e-mail marketing ukryty do ukończenia (nie da się go kupić —
    // brak planu i typu w zamówieniu). Włączenie: NEXT_PUBLIC_FEATURE_EMAIL_MARKETING=true przy buildzie.
    case 'emailMarketing':
      return envFlag(process.env.NEXT_PUBLIC_FEATURE_EMAIL_MARKETING, false);
    default:
      return false;
  }
}

export const clientFeatures = {
  eco: isClientFeatureEnabled('eco'),
  iam: isClientFeatureEnabled('iam'),
  referral: isClientFeatureEnabled('referral'),
  emailMarketing: isClientFeatureEnabled('emailMarketing'),
} as const;
