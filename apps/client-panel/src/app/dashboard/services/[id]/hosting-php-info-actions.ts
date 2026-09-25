'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** B-06 — konfiguracja PHP strony widziana przez serwer WWW (zadanie węzła). */
export interface PhpInfoStatus {
  domena: string;
  wToku: boolean;
  konfiguracja: {
    wersja: string;
    sapi: string;
    ini: Record<string, string | null>;
    rozszerzenia: string[];
    /** B-04 — CloudLinux PHP Selector konta; null, gdy serwer go nie ma albo konto używa PHP natywnego. */
    selektor: { wersja: string; rozszerzenia: { nazwa: string; stan: 'on' | 'off' | 'wbudowane' }[] } | null;
  } | null;
  odczytano: string | null;
  blad: string | null;
}

type Wynik = { ok: true; status: PhpInfoStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchPhpInfo(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<PhpInfoStatus>(`/services/${serviceId}/hosting-php-info?domain=${encodeURIComponent(domain)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function runPhpInfo(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<PhpInfoStatus>(`/services/${serviceId}/hosting-php-info`, { method: 'POST', body: JSON.stringify({ domain }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

/** B-04 — włączenie/wyłączenie rozszerzeń (zadanie węzła PHP_APPLY). */
export async function setPhpExtensions(
  serviceId: string,
  zmiany: { enable: string[]; disable: string[]; version: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-php/extensions`, { method: 'POST', body: JSON.stringify(zmiany) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
