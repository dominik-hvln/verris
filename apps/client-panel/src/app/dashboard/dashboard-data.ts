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

/**
 * Jedno zapytanie do API z błędem ZACHOWANYM, nie połkniętym.
 *
 * X-39. Wcześniej pięć z siedmiu zapytań snapshotu kończyło się
 * `.catch(() => null)` albo `.catch(() => [])`. Awaria stawała się wtedy
 * nieodróżnialna od prawdziwej pustki, a panel pokazywał ją klientowi jako
 * fakt: saldo `0,00 K`, `Punkty EKO: 0`. To nie jest łagodne zachowanie przy
 * awarii — to jest fałszywa informacja o cudzych pieniądzach, podana
 * z taką samą pewnością jak prawdziwa.
 *
 * Zwracany kształt jest ten sam, którego od początku używały `/services`
 * i `/domains` — po prostu przestaje być przywilejem dwóch zapytań.
 */
async function sprobuj<T>(zapytanie: () => Promise<T>): Promise<DashboardFetchResult<T>> {
  try {
    return { ok: true, data: await zapytanie() };
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
  /**
   * Po jednym kluczu na KAŻDE zapytanie snapshotu, nie tylko na te dwa,
   * które kiedyś ktoś uznał za ważne. Brak klucza znaczy „udało się";
   * obecność znaczy „nie wiemy" — i to jest inna rzecz niż „zero".
   */
  errors: {
    profile?: string;
    services?: string;
    domains?: string;
    ecoProgram?: string;
    wallet?: string;
    ecoLedger?: string;
    tickets?: string;
  };
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [profileRes, servicesRes, domainsRes, ecoProgramRes, walletRes, ecoLedgerRes, ticketsRes] =
    await Promise.all([
      sprobuj(() => fetchUserProfile()),
      fetchUserServicesSummary(),
      fetchUserDomainsPortfolio(),
      sprobuj(() => apiFetch<EcoProgramOverview>('/users/me/eco-program')),
      sprobuj(() => getWalletSummary()),
      sprobuj(() => apiFetch<EcoLedgerRowDto[]>('/users/me/eco-ledger')),
      sprobuj(() => fetchTickets()),
    ]);

  const errors: DashboardSnapshot['errors'] = {};
  if (!profileRes.ok) errors.profile = profileRes.error;
  if (!servicesRes.ok) errors.services = servicesRes.error;
  if (!domainsRes.ok) errors.domains = domainsRes.error;
  if (!ecoProgramRes.ok) errors.ecoProgram = ecoProgramRes.error;
  if (!walletRes.ok) errors.wallet = walletRes.error;
  if (!ecoLedgerRes.ok) errors.ecoLedger = ecoLedgerRes.error;
  if (!ticketsRes.ok) errors.tickets = ticketsRes.error;

  // Wartości zastępcze zostają — widok musi się wyrenderować. Różnica polega
  // na tym, że teraz obok każdej stoi informacja, czy jest prawdziwa.
  const tickets = ticketsRes.ok ? ticketsRes.data : [];

  return {
    profile: profileRes.ok ? profileRes.data : null,
    services: servicesRes.ok ? servicesRes.data : [],
    domains: domainsRes.ok ? domainsRes.data : [],
    ecoProgram: ecoProgramRes.ok ? ecoProgramRes.data : null,
    wallet: walletRes.ok ? walletRes.data : null,
    ecoLedger: ecoLedgerRes.ok ? ecoLedgerRes.data : [],
    tickets,
    openTickets: tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
    errors,
  };
}
