'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** I-13 — kopia strony na inną domenę konta (zadanie węzła). */
export interface SiteCloneStatus {
  wToku: boolean;
  kopie: {
    id: string;
    zrodlo: string | null;
    cel: string | null;
    status: string;
    utworzone: string;
    wordpress: boolean;
    nowaBaza: string | null;
    poprzedniePliki: string | null;
    blad: string | null;
  }[];
}

type Wynik = { ok: true; status: SiteCloneStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchSiteClone(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<SiteCloneStatus>(`/services/${serviceId}/hosting-site-clone`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function runSiteClone(serviceId: string, source: string, target: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<SiteCloneStatus>(`/services/${serviceId}/hosting-site-clone`, { method: 'POST', body: JSON.stringify({ source, target }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
