'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** E-19 — dziennik dostarczania poczty konta (zadanie węzła). */
export interface MailLogStatus {
  wToku: boolean;
  wczytano: string | null;
  adres: string | null;
  wpisy: { czas: string; id: string; znak: '<=' | '=>' | '->' | '**' | '=='; adres: string; szczegoly: string }[];
  blad: string | null;
}

type Wynik = { ok: true; status: MailLogStatus } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchMailLog(serviceId: string): Promise<Wynik> {
  try {
    return { ok: true, status: await apiFetch<MailLogStatus>(`/services/${serviceId}/hosting-mail-log`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function loadMailLog(serviceId: string, address?: string): Promise<Wynik> {
  try {
    return {
      ok: true,
      status: await apiFetch<MailLogStatus>(`/services/${serviceId}/hosting-mail-log`, {
        method: 'POST',
        body: JSON.stringify(address ? { address } : {}),
      }),
    };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
