'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** C-25/C-26 — repozytorium Git strony (zadanie węzła). */
export interface GitStatus {
  domena: string;
  wToku: boolean;
  klucz: string | null;
  operacje: {
    id: string;
    tryb: string | null;
    katalog: string;
    adres: string | null;
    status: string;
    utworzone: string;
    head: string | null;
    kopia: string | null;
    blad: string | null;
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
