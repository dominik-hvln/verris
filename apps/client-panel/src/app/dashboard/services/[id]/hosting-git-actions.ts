'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** Budowanie po klonowaniu/pobraniu zmian: '' = bez budowania. */
export type PresetBudowania = '' | 'npm-build' | 'npm-ci' | 'composer';

/** Ustawienia wdrożeń katalogu: preset budowania i NAZWY zmiennych (wartości nigdy nie wracają z API). */
export interface KonfiguracjaGit {
  katalog: string;
  budowanie: PresetBudowania;
  zmienne: string[];
  zmieniono: string;
}

/** C-25/C-26 — repozytorium Git strony (zadanie węzła). */
export interface GitStatus {
  domena: string;
  wToku: boolean;
  klucz: string | null;
  webhooki: { katalog: string; utworzony: string; ostatnio: string | null }[];
  konfiguracje?: KonfiguracjaGit[];
  operacje: {
    id: string;
    tryb: string | null;
    katalog: string;
    adres: string | null;
    status: string;
    utworzone: string;
    webhook: boolean;
    head: string | null;
    kopia: string | null;
    blad: string | null;
    /** Wynik budowania: ok / blad / brak (bez budowania); null — operacja sprzed tej funkcji albo w toku. */
    budowanie?: 'ok' | 'blad' | 'brak' | null;
    /** Ile zmiennych zapisano do .env. */
    zmienne?: number | null;
    trwaloS?: number | null;
    /** Ogon logu wdrożenia (≤ 4000 znaków). */
    log?: string | null;
  }[];
}

type Wynik = { ok: true; status: GitStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchGit(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<GitStatus>(`/services/${serviceId}/hosting-git?domain=${encodeURIComponent(domain)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function gitOp(
  serviceId: string,
  tryb: 'key' | 'clone' | 'pull',
  input: { domain: string; dir?: string; url?: string; branch?: string },
): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<GitStatus>(`/services/${serviceId}/hosting-git/${tryb}`, { method: 'POST', body: JSON.stringify(input) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function createGitWebhook(
  serviceId: string,
  input: { domain: string; dir?: string },
): Promise<{ ok: true; url: string; status: GitStatus } | { ok: false; error: string }> {
  try {
    const r = await apiFetch<GitStatus & { url: string }>(`/services/${serviceId}/hosting-git-webhook`, { method: 'POST', body: JSON.stringify(input) });
    return { ok: true, url: r.url, status: r };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function deleteGitWebhook(serviceId: string, input: { domain: string; dir?: string }): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<GitStatus>(`/services/${serviceId}/hosting-git-webhook/delete`, { method: 'POST', body: JSON.stringify(input) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function zapiszKonfiguracjeGit(
  serviceId: string,
  input: { domain: string; dir?: string; budowanie: PresetBudowania; zmienne?: { ustaw?: Record<string, string>; usun?: string[] } },
): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<GitStatus>(`/services/${serviceId}/hosting-git-konfiguracja`, { method: 'POST', body: JSON.stringify(input) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
