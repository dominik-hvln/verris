'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type UstawieniaDrzew = {
  wlaczone: boolean;
  srodowisko: 'produkcja' | 'test';
  kosztDrzewaGrosze: number;
  wkladNa100ZlNetto: number;
  idSadzenia: string;
  kredytyNaDrzewo: number;
  maksDrzewNaZamowienie: number;
  punktyNaDrzewo: number;
};

export type ZamowienieSadzenia = {
  id: string;
  rodzaj: 'PULA' | 'WLASNE';
  klient: string | null;
  liczbaDrzew: number;
  status: 'OCZEKUJE' | 'WYSYLANE' | 'NIEPEWNE' | 'ZLOZONE' | 'POSADZONE';
  srodowisko: string;
  proby: number;
  ostatniBlad: string | null;
  orderId: number | null;
  certificateUrl: string | null;
  createdAt: string;
  posadzoneAt: string | null;
};

export type PanelDrzew = {
  ustawienia: UstawieniaDrzew;
  tokeny: { produkcja: boolean; test: boolean };
  envTokenow: { produkcja: string; test: string };
  pulaCzesci: number;
  wkladyCzesci: Partial<Record<'USLUGA' | 'PUNKTY', number>>;
  posadzoneProdukcja: number;
  posadzoneTest: number;
  statusy: Partial<Record<ZamowienieSadzenia['status'], number>>;
  zamowienia: ZamowienieSadzenia[];
};

type Wynik<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const blad = (e: unknown, d: string) => (e instanceof AdminApiError || e instanceof Error ? e.message : d);

export async function fetchPanelDrzew(): Promise<PanelDrzew> {
  return adminApi<PanelDrzew>('/admin/eco/drzewa');
}

export async function zapiszUstawieniaDrzew(u: UstawieniaDrzew): Promise<Wynik<{ ustawienia: UstawieniaDrzew }>> {
  try {
    const ustawienia = await adminApi<UstawieniaDrzew>('/admin/eco/drzewa/ustawienia', { method: 'PATCH', body: u });
    revalidatePath('/settings/eko');
    return { ok: true, ustawienia };
  } catch (e) {
    return { ok: false, error: blad(e, 'Nie udało się zapisać ustawień.') };
  }
}

export async function sprawdzSaldo(): Promise<Wynik<{ saldo: number; srodowisko: string }>> {
  try {
    return { ok: true, ...(await adminApi<{ saldo: number; srodowisko: string }>('/admin/eco/drzewa/saldo', { method: 'POST' })) };
  } catch (e) {
    return { ok: false, error: blad(e, 'Nie udało się sprawdzić salda.') };
  }
}

export async function uruchomPrzebieg(): Promise<Wynik<{ raport: { pominiety?: string; wyslane: number; posadzone: number; bledy: string[] } }>> {
  try {
    const raport = await adminApi<{ pominiety?: string; wyslane: number; posadzone: number; bledy: string[] }>(
      '/admin/eco/drzewa/przebieg',
      { method: 'POST' },
    );
    revalidatePath('/settings/eko');
    return { ok: true, raport };
  } catch (e) {
    return { ok: false, error: blad(e, 'Przebieg nie powiódł się.') };
  }
}

export async function ponowZamowienie(id: string): Promise<Wynik> {
  try {
    await adminApi(`/admin/eco/drzewa/zamowienia/${encodeURIComponent(id)}/ponow`, { method: 'POST' });
    revalidatePath('/settings/eko');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: blad(e, 'Nie udało się ponowić.') };
  }
}

export async function potwierdzZamowienie(
  id: string,
  dane: { orderId: number; certificateUrl: string },
): Promise<Wynik> {
  try {
    await adminApi(`/admin/eco/drzewa/zamowienia/${encodeURIComponent(id)}/potwierdz`, { method: 'POST', body: dane });
    revalidatePath('/settings/eko');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: blad(e, 'Nie udało się potwierdzić.') };
  }
}
