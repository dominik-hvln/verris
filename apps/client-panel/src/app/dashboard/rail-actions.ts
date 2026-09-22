'use server';

import type { DomainDto, ServiceSummaryDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';
import { fetchTickets } from './support/actions';
import { isExpiringSoon } from '@/lib/domain-expiry';

/** Dane do menu bocznego i wyszukiwarki „/" — liczniki i lista usług. Błąd = `null` (nie zero). */
export interface RailData {
  services: { id: string; name: string; domain: string | null; kind: ServiceSummaryDto['productKind']; warn: boolean }[] | null;
  domains: number | null;
  /** Ile domen kończy rejestrację w ciągu 30 dni (0 = żadna, null = brak danych). */
  domainsExpiring: number | null;
  openTickets: number | null;
}

export async function fetchRailDataAction(): Promise<RailData> {
  const [services, domains, tickets] = await Promise.all([
    apiFetch<ServiceSummaryDto[]>('/services').catch(() => null),
    apiFetch<DomainDto[]>('/domains').catch(() => null),
    fetchTickets().catch(() => null),
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
    openTickets: tickets ? tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length : null,
  };
}
