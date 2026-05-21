/**
 * Client panel feature gates for start LIVE scope (Sprint B).
 * Set `NEXT_PUBLIC_FEATURE_*=true` in env when a module is ready for customers.
 */
export type ClientFeature = 'eco' | 'iam' | 'referral';

function envEnabled(name: string): boolean {
  const v = process.env[name];
  return v === 'true' || v === '1';
}

export function isClientFeatureEnabled(feature: ClientFeature): boolean {
  switch (feature) {
    case 'eco':
      return envEnabled('NEXT_PUBLIC_FEATURE_ECO');
    case 'iam':
      return envEnabled('NEXT_PUBLIC_FEATURE_IAM');
    case 'referral':
      return envEnabled('NEXT_PUBLIC_FEATURE_REFERRAL');
    default:
      return false;
  }
}

export const clientFeatures = {
  eco: isClientFeatureEnabled('eco'),
  iam: isClientFeatureEnabled('iam'),
  referral: isClientFeatureEnabled('referral'),
} as const;
