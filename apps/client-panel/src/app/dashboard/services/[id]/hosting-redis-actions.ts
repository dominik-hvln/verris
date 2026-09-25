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

/** D-16 — ten sam kształt dla Memcached (`/hosting-memcached`). */
export type Silnik = 'redis' | 'memcached';
const sciezka = (serviceId: string, silnik: Silnik) =>
  silnik === 'memcached' ? `/services/${serviceId}/hosting-memcached` : `/services/${serviceId}/hosting-redis`;

export async function fetchRedis(serviceId: string, silnik: Silnik = 'redis'): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<RedisStatus>(sciezka(serviceId, silnik)) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function setRedis(serviceId: string, enabled: boolean, silnik: Silnik = 'redis'): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<RedisStatus>(sciezka(serviceId, silnik), { method: 'POST', body: JSON.stringify({ enabled }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
