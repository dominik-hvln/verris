'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** I-04/I-05 — aktualizacje WordPressa domeny (zadanie węzła: kopia, aktualizacja, wycofanie). */
export interface WpPozycja {
  name: string;
  title: string;
  status: string;
  version: string;
  update: string;
  update_version: string;
}

export interface WpStatus {
  domena: string;
  wToku: boolean;
  brakWordpressa: boolean;
  stan: {
    version: string;
    core: { version: string; update_type: string }[];
    plugins: WpPozycja[];
    themes: WpPozycja[];
  } | null;
  sprawdzono: string | null;
  automat: { core: string; plugins: boolean; themes: boolean; ostatnio: string | null } | null;
  cache: { id: string; akcja: string | null; status: string; utworzone: string; wycofano: boolean; blad: string | null }[];
  aktualizacje: {
    id: string;
    status: string;
    automatyczna: boolean;
    utworzone: string;
    zakres: { core: string; plugins: string; themes: string };
    zmiany: { typ: 'core' | 'plugin' | 'theme'; nazwa: string; z: string; na: string }[];
    kopia: string | null;
    wycofano: boolean;
    blad: string | null;
  }[];
}

type Wynik = { ok: true; status: WpStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');
const url = (serviceId: string, sufiks = '') => `/services/${serviceId}/hosting-wp-updates${sufiks}`;

async function wynik(p: Promise<WpStatus>): Promise<Wynik> {
  try {
    return { ok: true, status: await p };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function fetchWpUpdates(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<WpStatus>(`${url(serviceId)}?domain=${encodeURIComponent(domain)}`));
}

export async function checkWpUpdates(serviceId: string, domain: string): Promise<Wynik> {
  return wynik(apiFetch<WpStatus>(url(serviceId, '/check'), { method: 'POST', body: JSON.stringify({ domain }) }));
}

export async function runWpUpdates(
  serviceId: string,
  input: { domain: string; core: string; plugins: '*' | string[]; themes: '*' | string[] },
): Promise<Wynik> {
  return wynik(apiFetch<WpStatus>(url(serviceId, '/run'), { method: 'POST', body: JSON.stringify(input) }));
}

export async function wpCache(serviceId: string, domain: string, action: 'on' | 'off' | 'purge'): Promise<Wynik> {
  return wynik(apiFetch<WpStatus>(url(serviceId, '/cache'), { method: 'POST', body: JSON.stringify({ domain, action }) }));
}

export async function setWpAutoUpdates(
  serviceId: string,
  input: { domain: string; core: string; plugins: boolean; themes: boolean },
): Promise<Wynik> {
  return wynik(apiFetch<WpStatus>(url(serviceId, '/auto'), { method: 'POST', body: JSON.stringify(input) }));
}
