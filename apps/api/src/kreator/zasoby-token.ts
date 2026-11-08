import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paczka 122 – adresy plików zdjęć z biblioteki kreatora bez logowania (podgląd w ramce bez ciasteczek, link
 * próbny, miniatury w panelu): `/kreator/z/<token>/<szer>.<webp|jpg>`. Token = id zasobu (uuid bez myślników,
 * 32 hex) + podpis HMAC-SHA256 (32 hex = 128 bitów) kluczem pochodnym od appKmsKey z własnym prefiksem
 * (jak publikacja-token.ts). Bez terminu: zdjęcie trafia i tak na publiczną stronę, a plik ma stałą treść
 * (Cache-Control immutable). Usunięcie zasobu = 404.
 *
 * Miniatury wyników bibliotek zewnętrznych idą przez proxy API (`/kreator/biblioteka/m/<token>`) – przeglądarka
 * klienta nie łączy się z dostawcą. Token niesie dostawcę i adres miniatury, termin (24 h) i podpis HMAC.
 */
const RE_ZASOBU = /^([0-9a-f]{32})([0-9a-f]{32})$/;

function podpis(prefiks: string, klucz: string, tresc: string): string {
  return createHmac('sha256', `${prefiks}|${klucz}`).update(tresc).digest('hex').slice(0, 32);
}

const rowne = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function utworzTokenZasobu(klucz: string, zasobId: string): string {
  const id = zasobId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Nieprawidłowy identyfikator zasobu.');
  return `${id}${podpis('kreator-zasob', klucz, id)}`;
}

/** Id zasobu z tokenu albo null (zły format, zły podpis). */
export function sprawdzTokenZasobu(klucz: string, token: string): string | null {
  const m = RE_ZASOBU.exec(String(token ?? ''));
  if (!m) return null;
  const [, id, sig] = m;
  if (!rowne(podpis('kreator-zasob', klucz, id), sig)) return null;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** Bazowy adres plików zasobu (z ukośnikiem na końcu) – dalej `<szer>.<format>`. */
export function adresBazowyZasobu(adresApi: string, klucz: string, zasobId: string): string {
  return `${adresApi.replace(/\/+$/, '')}/kreator/z/${utworzTokenZasobu(klucz, zasobId)}/`;
}

// ---------------------------------------------------------------------------------------------------------------
// Miniatury bibliotek zewnętrznych
// ---------------------------------------------------------------------------------------------------------------

export function utworzTokenMiniatury(klucz: string, dostawca: string, url: string, wazneDo: Date): string {
  const exp = Math.floor(wazneDo.getTime() / 1000).toString(36);
  const dane = Buffer.from(`${dostawca}\n${exp}\n${url}`, 'utf8').toString('base64url');
  return `${dane}.${podpis('kreator-miniatura', klucz, dane)}`;
}

export function sprawdzTokenMiniatury(klucz: string, token: string, teraz = new Date()): { dostawca: string; url: string } | null {
  const t = String(token ?? '');
  if (t.length > 2048) return null;
  const i = t.lastIndexOf('.');
  if (i <= 0) return null;
  const dane = t.slice(0, i);
  const sig = t.slice(i + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(dane) || !/^[0-9a-f]{32}$/.test(sig) || !rowne(podpis('kreator-miniatura', klucz, dane), sig)) return null;
  const [dostawca, exp, url] = Buffer.from(dane, 'base64url').toString('utf8').split('\n');
  if (!dostawca || !exp || !url || parseInt(exp, 36) * 1000 <= teraz.getTime()) return null;
  return { dostawca, url };
}
