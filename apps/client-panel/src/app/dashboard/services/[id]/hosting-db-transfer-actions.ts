'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** D-12 — eksport i import bazy (zadanie węzła, pliki w ~/verris-bazy). */
export interface DbTransferZadanie {
  id: string;
  tryb: 'export' | 'import';
  baza: string | null;
  plik: string | null;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  utworzone: string;
  zakonczone: string | null;
  wynik: string | null;
  blad: string | null;
}

export interface DbTransferStatus {
  katalog: string;
  wToku: boolean;
  zadania: DbTransferZadanie[];
  pliki: Array<{ nazwa: string; sciezka: string; rozmiar: number; zmieniony: string | null }>;
  bladPlikow: string | null;
}

type Wynik = { ok: true; status: DbTransferStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchDbTransfer(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<DbTransferStatus>(`/services/${serviceId}/hosting-db-transfer`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function exportDb(serviceId: string, db: string): Promise<Wynik> {
  try {
    const status = await apiFetch<DbTransferStatus>(`/services/${serviceId}/hosting-db-export`, { method: 'POST', body: JSON.stringify({ db }) });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function importDb(serviceId: string, db: string, file: string): Promise<Wynik> {
  try {
    const status = await apiFetch<DbTransferStatus>(`/services/${serviceId}/hosting-db-import`, { method: 'POST', body: JSON.stringify({ db, file }) });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
