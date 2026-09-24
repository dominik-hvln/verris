'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** C-21/C-22 — SSH w klatce i klucze SSH (zadanie węzła). */
export interface SshStatus {
  wToku: boolean;
  klucze: string[];
  ostatnie: { tryb: string | null; status: string; utworzone: string; blad: string | null } | null;
}

type Wynik = { ok: true; status: SshStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchSsh(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<SshStatus>(`/services/${serviceId}/hosting-ssh`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function setSsh(serviceId: string, enabled: boolean): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<SshStatus>(`/services/${serviceId}/hosting-ssh`, { method: 'POST', body: JSON.stringify({ enabled }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function setSshKeys(serviceId: string, keys: string[]): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<SshStatus>(`/services/${serviceId}/hosting-ssh/keys`, { method: 'POST', body: JSON.stringify({ keys }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
