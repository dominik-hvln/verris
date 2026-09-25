'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type DostawcaAi = 'openai' | 'anthropic';
export type KonfiguracjaAi = {
  szybki: { dostawca: DostawcaAi; model: string };
  analiza: { dostawca: DostawcaAi; model: string };
  limitKlientaUsd: number;
  ceny: Record<string, { wej: number; wyj: number }>;
};
export type UstawieniaAi = {
  konfiguracja: KonfiguracjaAi;
  znaneModele: { dostawca: DostawcaAi; model: string; nazwa: string; cenaWej: number; cenaWyj: number }[];
  klucze: Record<DostawcaAi, boolean>;
};
export type KosztyAi = {
  limitKlientaUsd: number;
  miesiacUsd: number;
  prognozaMiesiacaUsd: number;
  ostatnie30Dni: {
    funkcja: string;
    poziom: 'szybki' | 'analiza';
    model: string;
    wywolania: number;
    tokenyWej: number;
    tokenyWyj: number;
    kosztUsd: number;
  }[];
  klienci: { userId: string; email: string; wywolania: number; kosztUsd: number }[];
};

export async function fetchUstawieniaAi(): Promise<UstawieniaAi> {
  return adminApi<UstawieniaAi>('/admin/ai/ustawienia');
}

export async function fetchKosztyAi(): Promise<KosztyAi | null> {
  try {
    return await adminApi<KosztyAi>('/admin/ai/koszty');
  } catch {
    return null;
  }
}

export async function zapiszUstawieniaAi(
  konf: KonfiguracjaAi,
): Promise<{ ok: true; ustawienia: UstawieniaAi } | { ok: false; error: string }> {
  try {
    const ustawienia = await adminApi<UstawieniaAi>('/admin/ai/ustawienia', { method: 'PATCH', body: konf });
    revalidatePath('/settings/ai');
    return { ok: true, ustawienia };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError || e instanceof Error ? e.message : 'Nie udało się zapisać ustawień AI.',
    };
  }
}
