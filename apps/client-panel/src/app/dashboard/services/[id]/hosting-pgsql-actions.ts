'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** D-14 — bazy PostgreSQL konta. Hasło przychodzi tylko w odpowiedzi na utworzenie / zmianę hasła. */
export interface StanPgsql {
  wToku: boolean;
  odczytano: string | null;
  login: string;
  bazy: { nazwa: string; rozmiar: number }[];
  host: string;
  port: number;
  limit: number;
  blad: string | null;
  nowa?: { nazwa: string; uzytkownik: string; haslo: string; host: string; port: number };
}

type Wynik = { ok: true; stan: StanPgsql } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');
const wywolaj = async (f: () => Promise<StanPgsql>): Promise<Wynik> => {
  try {
    return { ok: true, stan: await f() };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
};

export async function fetchPgsql(serviceId: string): Promise<Wynik> {
  return wywolaj(() => apiFetch<StanPgsql>(`/services/${serviceId}/hosting-pgsql`));
}

export async function odswiezPgsql(serviceId: string): Promise<Wynik> {
  return wywolaj(() => apiFetch<StanPgsql>(`/services/${serviceId}/hosting-pgsql/refresh`, { method: 'POST' }));
}

export async function utworzPgsql(serviceId: string, nazwa: string): Promise<Wynik> {
  return wywolaj(() => apiFetch<StanPgsql>(`/services/${serviceId}/hosting-pgsql`, { method: 'POST', body: JSON.stringify({ nazwa }) }));
}

export async function usunPgsql(serviceId: string, nazwa: string): Promise<Wynik> {
  return wywolaj(() => apiFetch<StanPgsql>(`/services/${serviceId}/hosting-pgsql/delete`, { method: 'POST', body: JSON.stringify({ nazwa }) }));
}

export async function hasloPgsql(serviceId: string, nazwa: string): Promise<Wynik> {
  return wywolaj(() => apiFetch<StanPgsql>(`/services/${serviceId}/hosting-pgsql/password`, { method: 'POST', body: JSON.stringify({ nazwa }) }));
}
