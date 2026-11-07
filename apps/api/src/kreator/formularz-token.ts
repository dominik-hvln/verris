import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token formularza kontaktowego opublikowanej strony: `/kreator/formularz/<token>`. Token = id strony (uuid bez
 * myślników, 32 hex) + podpis HMAC-SHA256 (32 hex = 128 bitów) kluczem pochodnym od klucza aplikacji (appKmsKey)
 * z osobnym prefiksem (`kreator-formularz|`) – tokenu linku podglądu nie da się użyć jako tokenu formularza i odwrotnie.
 * Bez terminu ważności (adres jest wpisany w statyczny HTML na domenie klienta); unieważnia go stan w bazie:
 * wycofana albo usunięta strona → 404 (KreatorFormularzService).
 */
const RE = /^([0-9a-f]{32})([0-9a-f]{32})$/;

function podpis(klucz: string, id: string): string {
  return createHmac('sha256', `kreator-formularz|${klucz}`).update(id).digest('hex').slice(0, 32);
}

export function utworzTokenFormularza(klucz: string, stronaId: string): string {
  const id = stronaId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Nieprawidłowy identyfikator strony.');
  return `${id}${podpis(klucz, id)}`;
}

/** Id strony (uuid z myślnikami) albo null dla podrobionego/uszkodzonego tokenu. */
export function sprawdzTokenFormularza(klucz: string, token: string): string | null {
  const m = RE.exec(String(token ?? ''));
  if (!m) return null;
  const [, id, sig] = m;
  if (!timingSafeEqual(Buffer.from(podpis(klucz, id)), Buffer.from(sig))) return null;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** Pełny adres POST formularza: publiczny adres API + /kreator/formularz/<token>. */
export function adresFormularza(adresApi: string, klucz: string, stronaId: string): string {
  return `${adresApi.replace(/\/+$/, '')}/kreator/formularz/${utworzTokenFormularza(klucz, stronaId)}`;
}
