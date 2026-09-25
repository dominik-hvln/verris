import { listServices } from './services/data';
import { BEZ_USLUGI, najnizszyPostep, uslugiOnboardingu } from './onboarding-kroki';
import { pobierzKontoOnboardingu } from './onboarding-konto';

export interface OnboardingSnapshot {
  hasService: boolean;
  serviceId: string | null;
  domain: string | null;
  isEmailProduct: boolean;
  provisioning: boolean;
  dnsOk: boolean | null;
  tlsOk: boolean | null;
  /** PROD-02 — odnowienie zabezpieczone (karta, auto-doładowanie albo saldo na okres). Brak = nie wiemy. */
  platnoscOk?: boolean | null;
  /** PROD-02 — dane do faktury kompletne (konto, nie usługa). Brak = nie wiemy. */
  fakturaOk?: boolean | null;
}

/**
 * O-4 — stan banera „Pierwsze kroki". PROD-02: baner pokazuje usługę z
 * najniższym postępem (ta sama reguła co pasek w sidebarze), nie `services[0]`.
 */
export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const [services, konto] = await Promise.all([listServices().catch(() => []), pobierzKontoOnboardingu()]);
  const uslugi = uslugiOnboardingu(services, konto);
  return najnizszyPostep(uslugi)?.usluga.onboarding ?? uslugi[0]?.onboarding ?? BEZ_USLUGI;
}
