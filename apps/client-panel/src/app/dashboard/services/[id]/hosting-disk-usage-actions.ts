'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** C-15/K-03 — co zajmuje miejsce na koncie (zadanie węzła). */
export interface DiskUsageStatus {
  wToku: boolean;
  policzono: string | null;
  razem: { kb: number; pliki: number | null } | null;
  wpisy: { sciezka: string; kb: number; pliki: number | null }[];
  skrzynki: { email: string; kb: number }[];
  blad: string | null;
}

type Wynik = { ok: true; status: DiskUsageStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchDiskUsage(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<DiskUsageStatus>(`/services/${serviceId}/hosting-disk-usage`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function countDiskUsage(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<DiskUsageStatus>(`/services/${serviceId}/hosting-disk-usage`, { method: 'POST' }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
