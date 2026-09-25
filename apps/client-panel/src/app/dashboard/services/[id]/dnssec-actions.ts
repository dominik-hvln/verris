'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** F-06 — stan DNSSEC strefy (API: /services/:id/hosting-dns/dnssec, DirectAdmin CMD_API_DNS_ADMIN action=dnssec). */
export interface DnssecStan {
  domain: string;
  klucze: boolean;
  podpisana: boolean;
  podpisanaOd: string | null;
  wygasa: number | null;
  ds: string[];
  blad: string | null;
}

type Wynik = { ok: true; stan: DnssecStan } | { ok: false; error: string };

const url = (serviceId: string) => `/services/${encodeURIComponent(serviceId)}/hosting-dns/dnssec`;
const wynik = async (p: Promise<DnssecStan>): Promise<Wynik> => {
  try {
    return { ok: true, stan: await p };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'Nie udało się połączyć z serwerem.' };
  }
};

export async function fetchDnssec(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<DnssecStan>(`${url(serviceId)}?domain=${encodeURIComponent(domain)}`));
}

export async function wlaczDnssec(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<DnssecStan>(url(serviceId), { method: 'POST', body: JSON.stringify({ domain }) }));
}

export async function wylaczDnssec(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<DnssecStan>(url(serviceId), { method: 'DELETE', body: JSON.stringify({ domain }) }));
}
