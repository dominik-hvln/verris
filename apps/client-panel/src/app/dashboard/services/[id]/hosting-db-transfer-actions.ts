'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** D-12 — eksport i import bazy (zadanie węzła, pliki w ~/verris-bazy). */
export interface DbTransferZadanie {
  id: string;
  tryb: 'export' | 'import' | 'repair' | 'optimize' | 'privileges';
  uzytkownik: string | null;
  zestaw: string | null;
  baza: string | null;
  plik: string | null;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  utworzone: string;
  zakonczone: string | null;
  wynik: string | null;
  /** D-18 — naprawa/optymalizacja: liczba tabel i uwagi mysqlcheck. */
  tabele: number | null;
  uwagi: string[];
  blad: string | null;
}

export interface DbTransferStatus {
  /** D-17 — ostatni pomiar rozmiaru baz konta. */
  rozmiary: { kiedy: string; bazy: { baza: string; bajty: number; tabele: number }[] } | null;
  /** D-08 — ostatni zestaw uprawnień ustawiony w panelu, klucz „baza|użytkownik”. */
  uprawnienia: Record<string, { zestaw: 'full' | 'rw' | 'ro'; status: string }>;
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

/** D-18 — sprawdzenie z naprawą albo optymalizacja tabel bazy. */
export async function maintainDb(serviceId: string, db: string, mode: 'repair' | 'optimize'): Promise<Wynik> {
  try {
    const status = await apiFetch<DbTransferStatus>(`/services/${serviceId}/hosting-db-maintenance`, { method: 'POST', body: JSON.stringify({ db, mode }) });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

/** D-08 — zestaw uprawnień użytkownika MySQL do bazy. */
export async function setDbUserPrivileges(serviceId: string, db: string, user: string, privs: 'full' | 'rw' | 'ro'): Promise<Wynik> {
  try {
    const status = await apiFetch<DbTransferStatus>(`/services/${serviceId}/hosting-db-users/privileges`, { method: 'POST', body: JSON.stringify({ db, user, privs }) });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

/** D-17 — przeliczenie rozmiaru baz konta. */
export async function measureDbSizes(serviceId: string): Promise<Wynik> {
  try {
    const status = await apiFetch<DbTransferStatus>(`/services/${serviceId}/hosting-db-sizes`, { method: 'POST' });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
