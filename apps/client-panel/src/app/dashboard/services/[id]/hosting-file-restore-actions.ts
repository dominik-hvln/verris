'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** H-10/H-11 — podgląd archiwum kopii i odtworzenie pliku (zadanie węzła). */
export interface WpisArchiwum {
  typ: 'f' | 'd' | 'l';
  rozmiar: number;
  sciezka: string;
}

export interface FileRestoreStatus {
  wToku: boolean;
  lista: {
    archiwum: string | null;
    prefiks: string;
    status: string;
    wpisy: WpisArchiwum[];
    obciete: boolean;
    blad: string | null;
  } | null;
  odtworzenia: Array<{
    id: string;
    archiwum: string | null;
    sciezka: string | null;
    status: string;
    utworzone: string;
    katalog: string | null;
    blad: string | null;
  }>;
}

type Wynik = { ok: true; status: FileRestoreStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchFileRestore(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<FileRestoreStatus>(`/services/${serviceId}/hosting-file-restore`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function listArchive(serviceId: string, archive: string, path: string): Promise<Wynik> {
  try {
    const status = await apiFetch<FileRestoreStatus>(`/services/${serviceId}/hosting-file-restore/list`, { method: 'POST', body: JSON.stringify({ archive, path }) });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function restoreFromArchive(serviceId: string, archive: string, path: string): Promise<Wynik> {
  try {
    const status = await apiFetch<FileRestoreStatus>(`/services/${serviceId}/hosting-file-restore/extract`, { method: 'POST', body: JSON.stringify({ archive, path }) });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
