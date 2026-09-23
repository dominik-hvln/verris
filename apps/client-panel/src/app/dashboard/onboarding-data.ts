import { listServices } from './services/data';
import { BEZ_USLUGI, najnizszyPostep, uslugiOnboardingu } from './onboarding-kroki';

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
 * O-4 — stan banera „Pierwsze kroki". PROD-02: baner pokazuje usługę z
 * najniższym postępem (ta sama reguła co pasek w sidebarze), nie `services[0]`.
 */
export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const uslugi = uslugiOnboardingu(await listServices().catch(() => []));
  return najnizszyPostep(uslugi)?.usluga.onboarding ?? uslugi[0]?.onboarding ?? BEZ_USLUGI;
}
