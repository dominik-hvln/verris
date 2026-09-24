'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** D-15/J-03 — Redis konta (zadanie węzła). */
export interface RedisStatus {
  wToku: boolean;
  wlaczony: boolean;
  gniazdo: string | null;
  pamiecMb: number;
  blad: string | null;
}

type Wynik = { ok: true; status: RedisStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchRedis(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<RedisStatus>(`/services/${serviceId}/hosting-redis`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function setRedis(serviceId: string, enabled: boolean): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<RedisStatus>(`/services/${serviceId}/hosting-redis`, { method: 'POST', body: JSON.stringify({ enabled }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
