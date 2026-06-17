import { listServices } from './services/data';

export interface OnboardingSnapshot {
  hasService: boolean;
  serviceId: string | null;
  domain: string | null;
  isEmailProduct: boolean;
  provisioning: boolean;
  dnsOk: boolean | null;
  tlsOk: boolean | null;
}

/**
 * O-4 — lightweight state for the first-run onboarding wizard. Reuses the
 * existing services list (no extra API surface).
 */
export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  let services: Awaited<ReturnType<typeof listServices>> = [];
  try {
    services = await listServices();
  } catch {
    services = [];
  }
  const s = services[0];
  if (!s) {
    return {
      hasService: false,
      serviceId: null,
      domain: null,
      isEmailProduct: false,
      provisioning: false,
      dnsOk: null,
      tlsOk: null,
    };
  }
  return {
    hasService: true,
    serviceId: s.id,
    domain: s.account?.domain ?? null,
    isEmailProduct: s.productKind === 'EMAIL',
    provisioning: s.status !== 'ACTIVE',
    dnsOk: s.health?.checks?.dnsOk ?? null,
    tlsOk: s.health?.checks?.tlsOk ?? null,
  };
}
