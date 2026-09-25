'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** B-08/B-09 — aplikacje Node.js / Python konta (CloudLinux Selector, zadanie węzła). */
export type Interpreter = 'nodejs' | 'python';
export interface AplikacjaKonta {
  interpreter: Interpreter;
  root: string;
  version: string;
  domain: string;
  uri: string;
  startup: string;
  entry: string;
  status: 'started' | 'stopped';
  env: Record<string, string>;
}
export interface AplikacjeStatus {
  wToku: boolean;
  aplikacje: AplikacjaKonta[] | null;
  wersje: Record<Interpreter, string[]>;
  odczytano: string | null;
  blad: string | null;
}
export interface DaneAplikacji {
  interpreter: Interpreter;
  root: string;
  domain: string;
  uri: string;
  version: string;
  startup: string;
  entry?: string;
  env?: Record<string, string>;
}
export type AkcjaAplikacji = 'start' | 'stop' | 'restart' | 'destroy' | 'install';

type Wynik = { ok: true; status: AplikacjeStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');
const sciezka = (id: string) => `/services/${encodeURIComponent(id)}/hosting-apps`;

async function wywolaj(path: string, init?: { method: string; body?: unknown }): Promise<Wynik> {
  try {
    const status = await apiFetch<AplikacjeStatus>(path, init ? { method: init.method, body: init.body === undefined ? undefined : JSON.stringify(init.body) } : undefined);
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function fetchAplikacje(serviceId: string): Promise<Wynik> {
  return wywolaj(sciezka(serviceId));
}

export async function odswiezAplikacje(serviceId: string): Promise<Wynik> {
  return wywolaj(`${sciezka(serviceId)}/refresh`, { method: 'POST' });
}

export async function zapiszAplikacje(serviceId: string, dane: DaneAplikacji, nowa: boolean): Promise<Wynik> {
  return wywolaj(sciezka(serviceId), { method: nowa ? 'POST' : 'PUT', body: dane });
}

export async function akcjaAplikacji(serviceId: string, interpreter: Interpreter, root: string, action: AkcjaAplikacji): Promise<Wynik> {
  return wywolaj(`${sciezka(serviceId)}/action`, { method: 'POST', body: { interpreter, root, action } });
}
