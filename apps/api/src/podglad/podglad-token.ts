import { createHmac, timingSafeEqual } from 'crypto';

/** Noc 15.10 — ścieżka wejścia z linku z panelu: `/__verris_podglad?k=<klucz dostępu>` ustawia ciasteczko i wraca na `/`. */
export const SCIEZKA_WEJSCIA = '/__verris_podglad';
export const CIASTKO_DOSTEPU = 'verris_podglad';

/**
 * 15.10 — tymczasowy adres podglądu strony przed zmianą DNS (decyzja Dominika 14.10: „zespół widzi wynik testu strony
 * na tymczasowym adresie”). Adres `<token>.<domena podglądu>` — token to jedna etykieta DNS (≤ 63 znaki, [a-z0-9]):
 * `p` + ważność (sekundy unixowe, base36, 7 znaków) + identyfikator konta (uuid bez myślników, 32 hex) + podpis HMAC
 * (pierwsze 16 hex). Bez bazy: wygasa sam, nie da się go podrobić bez klucza.
 */
const RE = /^p([0-9a-z]{7})([0-9a-f]{32})([0-9a-f]{16})$/;

function podpis(klucz: string, tresc: string): string {
  return createHmac('sha256', `podglad|${klucz}`).update(tresc).digest('hex').slice(0, 16);
}

export function utworzTokenPodgladu(klucz: string, accountId: string, wygasa: Date): string {
  const id = accountId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Nieprawidłowy identyfikator konta.');
  const exp = Math.floor(wygasa.getTime() / 1000).toString(36).padStart(7, '0');
  return `p${exp}${id}${podpis(klucz, `${exp}.${id}`)}`;
}

export function sprawdzTokenPodgladu(klucz: string, token: string, teraz = new Date()): { accountId: string; wygasa: Date } | null {
  const m = RE.exec(token);
  if (!m) return null;
  const [, exp, id, sig] = m;
  const oczekiwany = Buffer.from(podpis(klucz, `${exp}.${id}`));
  if (!timingSafeEqual(oczekiwany, Buffer.from(sig))) return null;
  const wygasa = new Date(parseInt(exp, 36) * 1000);
  if (wygasa.getTime() <= teraz.getTime()) return null;
  const accountId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  return { accountId, wygasa };
}

/**
 * Noc 15.10 (przegląd podglądu): nazwa hosta trafia do publicznych logów Certificate Transparency (certyfikat
 * on-demand na każdą nazwę), więc sama etykieta NIE może dawać dostępu. Klucz dostępu (HMAC etykiety innym kluczem,
 * 128 bitów) jest tylko w linku z panelu i w ciasteczku hosta podglądu.
 */
export function kluczDostepuPodgladu(klucz: string, etykieta: string): string {
  return createHmac('sha256', `podglad-dostep|${klucz}`).update(etykieta).digest('hex').slice(0, 32);
}

export function rowneStaloczasowo(a: string | null | undefined, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Termin ważności wyrównany do tygodnia (UTC, od poniedziałku): ta sama etykieta przez cały tydzień — jeden certyfikat
 * na konto na tydzień zamiast nowego przy każdym otwarciu karty (limit Let's Encrypt: 50 certyfikatów na domenę
 * tygodniowo). Ważność 7–14 dni.
 */
export function terminTygodniowy(teraz = new Date()): Date {
  const TYDZIEN = 7 * 86400000;
  const PONIEDZIALEK = 4 * 86400000; // 1970-01-05 (poniedziałek) − 1970-01-01 (czwartek)
  const nr = Math.floor((teraz.getTime() - PONIEDZIALEK) / TYDZIEN);
  return new Date(PONIEDZIALEK + (nr + 2) * TYDZIEN);
}
