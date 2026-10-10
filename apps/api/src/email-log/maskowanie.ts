/**
 * Fala 1B — podgląd maila na karcie klienta w panelu admina. Wpis dziennika poczty może nieść linki
 * jednorazowe (reset hasła, aktywacja, zmiana e-maila, magic link, wypis z listą, pobranie eksportu)
 * — operator nie może ich zobaczyć w całości, bo mógłby ich użyć zamiast klienta. Maskujemy w API,
 * żeby token w ogóle nie wyszedł do przeglądarki.
 *
 * Reguły (lepiej zamaskować za dużo niż za mało):
 * - parametr zapytania o nazwie z listy (token, code, key, sig…) albo o wartości ≥ 16 znaków;
 * - segment ścieżki URL ≥ 16 znaków z cyfrą (token w ścieżce, UUID);
 * - w zwykłym tekście ciąg ≥ 24 znaków z literami i cyframi (token wklejony bez linku, JWT).
 */
export const MASKA = '•••';

const NAZWA_SEKRETU = /token|code|key|sig|secret|hash|otp|auth|magic|nonce|ticket|state|session|password|haslo/i;
const URL_W_TEKSCIE = /https?:\/\/[^\s"'<>]+/gi;
const DLUGI_CIAG = /[A-Za-z0-9_-]{24,}/g;

function wygladaNaSekret(s: string, min: number): boolean {
  return s.length >= min && /\d/.test(s) && /[A-Za-z]/.test(s);
}

function maskujUrl(url: string): string {
  const [przedHash] = url.split('#', 1);
  const q = przedHash!.indexOf('?');
  const sciezka = q === -1 ? przedHash! : przedHash!.slice(0, q);
  const zapytanie = q === -1 ? null : przedHash!.slice(q + 1);
  const m = /^(https?:\/\/[^/?#]+)(.*)$/i.exec(sciezka);
  const host = m?.[1] ?? sciezka;
  const reszta = (m?.[2] ?? '')
    .split('/')
    // Ciąg w segmencie, nie cały segment: link w nawiasie albo z kropką na końcu też jest maskowany.
    .map((seg) => seg.replace(/[A-Za-z0-9_~%-]{16,}/g, (t) => (wygladaNaSekret(t, 16) ? MASKA : t)))
    .join('/');
  const params =
    zapytanie === null
      ? ''
      : '?' +
        zapytanie
          .split('&')
          .map((para) => {
            const i = para.indexOf('=');
            if (i === -1) return para;
            const nazwa = para.slice(0, i);
            const wartosc = para.slice(i + 1);
            return wartosc && (NAZWA_SEKRETU.test(nazwa) || wartosc.length >= 16) ? `${nazwa}=${MASKA}` : para;
          })
          .join('&');
  // Fragment (#…) potrafi nieść token (OAuth, magic link) — zawsze w całości zamaskowany.
  return host + reszta + params + (url.includes('#') ? `#${MASKA}` : '');
}

/** Tekst z zamaskowanymi linkami jednorazowymi i tokenami. */
export function maskujTekst(tekst: string): string {
  const linki: string[] = [];
  const bezLinkow = tekst.replace(URL_W_TEKSCIE, (u) => {
    linki.push(maskujUrl(u));
    return `\u0000${linki.length - 1}\u0000`;
  });
  return bezLinkow
    .replace(DLUGI_CIAG, (s) => (wygladaNaSekret(s, 24) ? MASKA : s))
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => linki[Number(i)]!);
}

/** Maskuje wszystkie napisy w strukturze (metadata JSON wpisu dziennika poczty). */
export function maskujWartosc<T>(v: T): T {
  if (typeof v === 'string') return maskujTekst(v) as T;
  if (Array.isArray(v)) return v.map((x) => maskujWartosc(x)) as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, maskujWartosc(x)])) as T;
  }
  return v;
}
