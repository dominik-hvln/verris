/**
 * Client panel feature gates (Sprint B).
 * EKO + program partnerski są LIVE — domyślnie włączone; wyłącz jawnie przez `=false`.
 * IAM pozostaje opt-in (zespoły/agencje), dopóki nie jest w ofercie startowej.
 */
export type ClientFeature = 'eco' | 'iam' | 'referral';

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultWhenUnset;
  if (v === 'false' || v === '0') return false;
  return v === 'true' || v === '1';
}

export function isClientFeatureEnabled(feature: ClientFeature): boolean {
  switch (feature) {
    case 'eco':
      return envFlag('NEXT_PUBLIC_FEATURE_ECO', true);
    case 'referral':
      return envFlag('NEXT_PUBLIC_FEATURE_REFERRAL', true);
    case 'iam':
      return envFlag('NEXT_PUBLIC_FEATURE_IAM', false);
    default:
      return false;
  }
}

export const clientFeatures = {
  eco: isClientFeatureEnabled('eco'),
  iam: isClientFeatureEnabled('iam'),
  referral: isClientFeatureEnabled('referral'),
} as const;
