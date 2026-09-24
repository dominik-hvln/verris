'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** C-14 — wyszukiwanie plików w katalogu strony (zadanie węzła). */
export interface FileSearchStatus {
  domena: string;
  wToku: boolean;
  zapytanie: { name: string; text: string } | null;
  wynik: { pliki: { p: string; s: number; t: number }[]; ucieto: boolean } | null;
  blad: string | null;
}

type Wynik = { ok: true; status: FileSearchStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchFileSearch(serviceId: string, domain: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<FileSearchStatus>(`/services/${serviceId}/hosting-file-search?domain=${encodeURIComponent(domain)}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function runFileSearch(serviceId: string, domain: string, name: string, text: string): Promise<Wynik> {
  try {
    return {
      ok: true,
      status: await apiFetch<FileSearchStatus>(`/services/${serviceId}/hosting-file-search`, { method: 'POST', body: JSON.stringify({ domain, name, text }) }),
    };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
