/**
 * P5-04 (beta 3.11) — sprawdzenie domeny wpisanej w zamówieniu jeszcze w panelu, z tą samą regułą co API
 * (`apps/api/src/subscriptions/dto/domena-zamowienia.ts`): etykiety 1–63 znaki bez myślnika na brzegu,
 * bez pustych etykiet, całość do 253 znaków. Polskie znaki (IDN) zamieniamy na zapis ASCII tak jak przeglądarka
 * (WHATWG URL, https://url.spec.whatwg.org/#concept-domain-to-ascii).
 */
const WZORZEC =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

export type WynikDomeny = { ok: true; domena: string; ascii: string } | { ok: false; blad: string };

export function sprawdzDomene(wpisana: string): WynikDomeny {
  let d = wpisana.trim().toLowerCase();
  if (!d) return { ok: false, blad: 'Wpisz domenę, np. mojafirma.pl.' };
  if (/^[a-z]+:\/\//.test(d) || d.includes('/')) {
    return { ok: false, blad: 'Wpisz samą domenę, bez http:// i ukośników, np. mojafirma.pl.' };
  }
  d = d.replace(/\.+$/, '');
  let ascii = d;
  if (!d.includes('..') && /[^a-z0-9.-]/.test(d)) {
    try {
      ascii = new URL(`http://${d}`).hostname;
    } catch {
      return { ok: false, blad: 'Ta domena ma niedozwolone znaki. Sprawdź, czy nie ma w niej spacji ani przecinka.' };
    }
  }
  if (!WZORZEC.test(ascii)) {
    return {
      ok: false,
      blad: 'To nie wygląda na poprawną domenę. Sprawdź kropki i myślniki, np. moja-firma.pl.',
    };
  }
  return { ok: true, domena: d, ascii };
}
