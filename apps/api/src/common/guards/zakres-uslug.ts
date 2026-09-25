/**
 * PB-20 — zakres usług subkonta / członkostwa. Pusta lista = całe konto (bez zmian).
 *
 * Przy zakresie przechodzi wyłącznie:
 *  - trasa konkretnej usługi (`/services/:id/…`, `/subscriptions/:id/…`, …), gdy id jest w zakresie,
 *  - lista usług (`GET /services`) — kontroler sam ją zawęża,
 *  - rzeczy osoby zalogowanej i treści publiczne (powiadomienia, zgody, pomoc, zgłoszenia).
 * Wszystko inne (portfel, domeny, VPS, zamówienia, dodatki, IAM…) to zasoby całego konta — odmowa.
 */
export const ZAKRES_ODMOWA = 'Masz dostęp tylko do wybranych usług tego konta.';

const TRASA_USLUGI = /^\/(services|subscriptions|email-marketing|analytics-sites)\/:(\w+)(\/|$)/;
const WOLNE = [
  '/auth', '/healthz', '/readyz', '/status', '/public', '/fonts', '/kb', '/plans', '/legal', '/brand',
  '/telemetry', '/notifications', '/me/consent', '/me/marketing-preferences', '/me/status', '/me/feature-flags',
  '/me/beta', '/me/partner', '/tickets', '/users/me',
];

export function wZakresie(
  method: string,
  wzorzec: string,
  params: Record<string, string | undefined>,
  zakres: readonly string[] | null | undefined,
): boolean {
  if (!zakres || zakres.length === 0) return true;
  const sciezka = wzorzec.toLowerCase();
  const m = TRASA_USLUGI.exec(wzorzec);
  if (m) {
    const id = params[m[2]];
    return typeof id === 'string' && zakres.includes(id);
  }
  if (sciezka === '/services' && method.toUpperCase() === 'GET') return true;
  // `/users/me/…` to też tokeny API i webhooki konta — te są całego konta.
  if (sciezka.startsWith('/users/me/')) return false;
  return WOLNE.some((p) => sciezka === p || sciezka.startsWith(`${p}/`));
}
