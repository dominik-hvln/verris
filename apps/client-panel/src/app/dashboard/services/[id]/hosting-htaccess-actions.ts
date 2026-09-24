'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** B-17/B-18/G-07 — strony błędów, listowanie katalogów i HSTS w .htaccess strony (zadanie węzła). */
export interface HtaccessUstawienia {
  indexes: 'on' | 'off' | 'default';
  hsts: boolean;
  e403: string;
  e404: string;
  e500: string;
}

export interface HtaccessStatus {
  domena: string;
  wToku: boolean;
  ustawienia: HtaccessUstawienia | null;
  odczytano: string | null;
  blad: string | null;
}

type Wynik = { ok: true; status: HtaccessStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');
const url = (serviceId: string, sufiks = '') => `/services/${serviceId}/hosting-htaccess${sufiks}`;

async function wynik(p: Promise<HtaccessStatus>): Promise<Wynik> {
  try {
    return { ok: true, status: await p };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function fetchHtaccess(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<HtaccessStatus>(`${url(serviceId)}?domain=${encodeURIComponent(domain)}`));
}

export async function readHtaccess(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<HtaccessStatus>(url(serviceId, '/read'), { method: 'POST', body: JSON.stringify({ domain }) }));
}

export async function saveHtaccess(serviceId: string, domain: string, u: HtaccessUstawienia): Promise<Wynik> {
  return wynik(apiFetch<HtaccessStatus>(url(serviceId), { method: 'POST', body: JSON.stringify({ domain, ...u }) }));
}
