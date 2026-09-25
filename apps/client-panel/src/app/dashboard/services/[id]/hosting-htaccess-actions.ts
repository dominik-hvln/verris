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

/** A-06 — katalog główny domeny: podkatalog public_html ('' = public_html). */
export interface Docroot {
  domain: string;
  katalog: string;
}
type WynikDocroot = { ok: true; docroot: Docroot } | { ok: false; error: string };

export async function fetchDocroot(serviceId: string, domain: string): Promise<WynikDocroot> {
  try {
    return { ok: true, docroot: await apiFetch<Docroot>(`/services/${serviceId}/hosting-docroot?domain=${encodeURIComponent(domain)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function saveDocroot(serviceId: string, domain: string, katalog: string): Promise<WynikDocroot> {
  try {
    const docroot = await apiFetch<Docroot>(`/services/${serviceId}/hosting-docroot`, { method: 'POST', body: JSON.stringify({ domain, katalog }) });
    return { ok: true, docroot };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
