'use server';

import { headers } from 'next/headers';
import { odczytajBlad, odczytajOdpowiedz, type WynikAsystenta } from './asystent-stan';
import { adresApi } from './asystent-status';

/**
 * Asystent AI na verris.pl — server actions (jak lib/submit-callback.ts): forward IP i User-Agent użytkownika,
 * żeby limity per IP w API liczyły odwiedzającego, a nie serwer www. Bez cookies.
 */
async function naglowki(): Promise<Record<string, string>> {
  const h = await headers();
  const xff = h.get('x-forwarded-for') ?? '';
  const ua = h.get('user-agent') ?? '';
  return {
    'content-type': 'application/json',
    ...(xff ? { 'x-forwarded-for': xff } : {}),
    ...(ua ? { 'user-agent': ua } : {}),
  };
}

/** POST /public/asystent → odpowiedź albo błąd z kodem (CAPTCHA_WYMAGANA, LIMIT_*, NIEDOSTEPNY…). */
export async function zapytajAsystenta(input: {
  rozmowaId?: string | null;
  pytanie: string;
  captchaToken?: string;
}): Promise<WynikAsystenta> {
  const pytanie = (input.pytanie ?? '').trim().slice(0, 1000);
  if (!pytanie) return { ok: false, status: 400, komunikat: 'Napisz pytanie.' };
  try {
    const res = await fetch(`${adresApi()}/public/asystent`, {
      method: 'POST',
      headers: await naglowki(),
      body: JSON.stringify({
        pytanie,
        ...(input.rozmowaId ? { rozmowaId: input.rozmowaId } : {}),
        ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
      }),
      // Odpowiedź modelu z ponowną próbą filtra może potrwać — 45 s zamiast 8 s formularzy.
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
    const cialo: unknown = await res.json().catch(() => null);
    if (!res.ok) return odczytajBlad(res.status, cialo);
    const dane = odczytajOdpowiedz(cialo);
    return dane ? { ok: true, dane } : { ok: false, status: 502 };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** „Poproś o telefon” z okna asystenta → POST /public/leads/callback z rozmowaId (zespół dostaje przebieg rozmowy). */
export async function poprosOTelefonZRozmowy(input: {
  name: string;
  phone: string;
  preferredTime: 'rano' | 'poludnie' | 'popoludnie';
  consentText: string;
  rozmowaId?: string | null;
  page?: string;
  captchaToken?: string;
}): Promise<{ ok: boolean; status?: number }> {
  try {
    const { rozmowaId, ...reszta } = input;
    const res = await fetch(`${adresApi()}/public/leads/callback`, {
      method: 'POST',
      headers: await naglowki(),
      body: JSON.stringify({ ...reszta, ...(rozmowaId ? { rozmowaId } : {}) }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false };
  }
}
