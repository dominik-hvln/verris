import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Link podglądu wersji próbnej (paczka 121): `/kreator/p/<token>/`. Token = id strony (uuid bez myślników, 32 hex)
 * + termin (sekundy unixowe, base36, 7 znaków) + podpis HMAC-SHA256 (32 hex = 128 bitów) kluczem pochodnym od
 * klucza aplikacji (appKmsKey, ten sam mechanizm co podglad-token.ts – bez nowego sekretu w .env).
 * Bez bazy nie da się go podrobić; ważność dodatkowo sprawdza serwis (strona istnieje, termin ≤ podgladDo).
 */
const RE = /^([0-9a-f]{32})([0-9a-z]{7})([0-9a-f]{32})$/;

function podpis(klucz: string, tresc: string): string {
  return createHmac('sha256', `kreator-podglad|${klucz}`).update(tresc).digest('hex').slice(0, 32);
}

export function utworzTokenLinku(klucz: string, stronaId: string, wazneDo: Date): string {
  const id = stronaId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Nieprawidłowy identyfikator strony.');
  const exp = Math.floor(wazneDo.getTime() / 1000).toString(36).padStart(7, '0');
  return `${id}${exp}${podpis(klucz, `${id}.${exp}`)}`;
}

export type WynikTokenu = { stan: 'ok' | 'wygasl'; stronaId: string; wazneDo: Date } | { stan: 'zly' };

/** Podpis sprawdzany zawsze (także dla wygasłych) – „Link wygasł” tylko dla linków, które naprawdę wydaliśmy. */
export function sprawdzTokenLinku(klucz: string, token: string, teraz = new Date()): WynikTokenu {
  const m = RE.exec(String(token ?? ''));
  if (!m) return { stan: 'zly' };
  const [, id, exp, sig] = m;
  if (!timingSafeEqual(Buffer.from(podpis(klucz, `${id}.${exp}`)), Buffer.from(sig))) return { stan: 'zly' };
  const wazneDo = new Date(parseInt(exp, 36) * 1000);
  const stronaId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  return { stan: wazneDo.getTime() <= teraz.getTime() ? 'wygasl' : 'ok', stronaId, wazneDo };
}
