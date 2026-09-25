'use server';

import type { DomainDto, ServiceSummaryDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';
import { fetchTickets } from './support/actions';
import { isExpiringSoon } from '@/lib/domain-expiry';
import { uslugiOnboardingu, type UslugaOnboardingu } from './onboarding-kroki';
import { pobierzKontoOnboardingu } from './onboarding-konto';

/** Dane do menu bocznego i wyszukiwarki „/" — liczniki i lista usług. Błąd = `null` (nie zero). */
export interface RailData {
  services: { id: string; name: string; domain: string | null; kind: ServiceSummaryDto['productKind']; warn: boolean }[] | null;
  domains: number | null;
  /** Ile domen kończy rejestrację w ciągu 30 dni (0 = żadna, null = brak danych). */
  domainsExpiring: number | null;
  openTickets: number | null;
  /** PROD-02 — stan konfiguracji każdej żywej usługi; pasek w sidebarze bierze najniższy. */
  onboarding: UslugaOnboardingu[] | null;
  /** O-09 — partner (reseller), który prowadzi konto; `null` = brak albo nie wiemy. */
  partner: PartnerKonta | null;
}

export interface PartnerKonta {
  nazwa: string;
  logoUrl: string | null;
  kontakt: string;
}

export async function fetchRailDataAction(): Promise<RailData> {
  const [services, domains, tickets, konto, partner] = await Promise.all([
    apiFetch<ServiceSummaryDto[]>('/services').catch(() => null),
    apiFetch<DomainDto[]>('/domains').catch(() => null),
    fetchTickets().catch(() => null),
    pobierzKontoOnboardingu(),
    apiFetch<PartnerKonta | null>('/me/partner').catch(() => null),
  ]);
  return {
    services: services
      ? services
          .filter((s) => s.status !== 'CANCELED' && s.status !== 'EXPIRED')
          .map((s) => ({
            id: s.id,
            name: s.planName,
            domain: s.account?.domain ?? null,
            kind: s.productKind,
            warn: s.status !== 'ACTIVE' || s.health?.label === 'attention' || s.health?.label === 'critical',
          }))
      : null,
    domains: domains ? domains.length : null,
    domainsExpiring: domains ? domains.filter((d) => isExpiringSoon(d.expiresAt)).length : null,
    onboarding: services ? uslugiOnboardingu(services, konto) : null,
    partner: partner || null,
    openTickets: tickets
      ? tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'WAITING_CUSTOMER').length
      : null,
  };
}
