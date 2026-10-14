import { createHmac, timingSafeEqual } from 'crypto';

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
