'use server';

import { adminApi, AdminApiError } from '@/lib/api';

/** H-16 — odtworzenie konta z kopii off-site na innym węźle (utrata węzła źródłowego). */
export type ZadanieNaWezle = {
  id: string;
  status: string;
  wezel: string;
  archiwum: string | null;
  blad: string | null;
  utworzone: string;
  zakonczone: string | null;
} | null;
export type StanNaWezle = {
  wezelZrodlowy: { id: string; prefiks: string | null };
  wToku: boolean;
  lista: ZadanieNaWezle;
  archiwa: { name: string; sizeBytes: number | null; modifiedAt: string | null }[];
  odtworzenie: ZadanieNaWezle;
};

type Wynik = { ok: true; stan: StanNaWezle } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : 'Nie udało się.');
const url = (id: string, s = '') => `/admin/subscriptions/${encodeURIComponent(id)}/odtworzenie-na-wezle${s}`;

export async function stanNaWezleAction(id: string): Promise<Wynik> {
  try {
    return { ok: true, stan: await adminApi<StanNaWezle>(url(id)) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function listaNaWezleAction(id: string, targetServerId: string, snapshot: string): Promise<Wynik> {
  try {
    return { ok: true, stan: await adminApi<StanNaWezle>(url(id, '/lista'), { method: 'POST', body: { targetServerId, ...(snapshot ? { snapshot } : {}) } }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function odtworzNaWezleAction(id: string, targetServerId: string, archive: string, snapshot: string): Promise<Wynik> {
  try {
    return {
      ok: true,
      stan: await adminApi<StanNaWezle>(url(id), { method: 'POST', body: { targetServerId, archive, ...(snapshot ? { snapshot } : {}) } }),
    };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
