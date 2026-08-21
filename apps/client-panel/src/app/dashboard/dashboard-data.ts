'use server';

import type { DomainDto, ServiceSummaryDto, WalletSummaryDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';
import { getWalletSummary } from './billing/data';
import { fetchUserProfile, type UserProfile } from './settings/actions';
import { fetchTickets, type TicketSummary } from './support/actions';
import type { EcoLedgerRowDto, EcoProgramOverview } from './eco/eco-data';

export type DashboardFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function describeApiError(err: unknown): { message: string; status?: number } {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const status = 'status' in err && typeof (err as { status: unknown }).status === 'number' ? (err as { status: number }).status : undefined;
    return { message: (err as { message: string }).message, status };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: 'Nie udało się pobrać danych z API' };
}

export async function fetchUserServicesSummary(): Promise<
  DashboardFetchResult<ServiceSummaryDto[]>
> {
  try {
    const data = await apiFetch<ServiceSummaryDto[]>('/services');
    return { ok: true, data };
  } catch (err) {
    const { message, status } = describeApiError(err);
    return { ok: false, error: message, status };
  }
}

export async function fetchUserDomainsPortfolio(): Promise<
  DashboardFetchResult<DomainDto[]>
> {
  try {
    const data = await apiFetch<DomainDto[]>('/domains');
    return { ok: true, data };
  } catch (err) {
    const { message, status } = describeApiError(err);
    return { ok: false, error: message, status };
  }
}

export type DashboardSnapshot = {
  profile: UserProfile | null;
  services: ServiceSummaryDto[];
  domains: DomainDto[];
  ecoProgram: EcoProgramOverview | null;
  wallet: WalletSummaryDto | null;
  ecoLedger: EcoLedgerRowDto[];
  tickets: TicketSummary[];
  openTickets: number;
  errors: { services?: string; domains?: string };
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const errors: DashboardSnapshot['errors'] = {};

  const [profile, servicesRes, domainsRes, ecoProgram, wallet, ecoLedger, tickets] = await Promise.all([
    fetchUserProfile().catch(() => null),
    fetchUserServicesSummary(),
    fetchUserDomainsPortfolio(),
    apiFetch<EcoProgramOverview>('/users/me/eco-program').catch(() => null),
    getWalletSummary().catch(() => null),
    apiFetch<EcoLedgerRowDto[]>('/users/me/eco-ledger').catch(() => [] as EcoLedgerRowDto[]),
    fetchTickets().catch(() => [] as TicketSummary[]),
  ]);

  let services: ServiceSummaryDto[] = [];
  if (servicesRes.ok) services = servicesRes.data;
  else errors.services = servicesRes.error;

  let domains: DomainDto[] = [];
  if (domainsRes.ok) domains = domainsRes.data;
  else errors.domains = domainsRes.error;

  const openTickets = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;

  return {
    profile,
    services,
    domains,
    ecoProgram,
    wallet,
    ecoLedger,
    tickets,
    openTickets,
    errors,
  };
}
