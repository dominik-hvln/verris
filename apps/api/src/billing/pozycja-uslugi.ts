/**
 * Nazwa pozycji dokumentu za usługę — wspólna dla proformy na odnowienie i dokumentu za wpłatę, którą klient
 * opłacił konkretną usługę (zakup przez Paynow, odnowienie zaległej usługi, proforma). Dokument mówi, ZA CO
 * jest wpłata (usługa, okres, domena), a nie „Doładowanie konta”, gdy klient płacił za usługę.
 */

/**
 * Koniec kolejnego okresu rozliczeniowego — ta sama arytmetyka co `addInterval` w
 * renewal.scheduler.ts (import stamtąd wciągałby moduł subskrypcji do billingu).
 */
export function koniecOkresu(od: Date, interval: 'MONTH' | 'YEAR'): Date {
  const d = new Date(od);
  if (interval === 'YEAR') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Data w zapisie polskim (dd.mm.rrrr) w strefie Europe/Warsaw. */
export function dataPl(d: Date): string {
  return d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Najdłuższa nazwa pozycji — z zapasem pod limit pola P_7 w FA(3) (512 znaków). */
export const MAKS_NAZWA_POZYCJI = 256;

export function nazwaPozycjiUslugi(u: {
  plan: string;
  interval: 'MONTH' | 'YEAR';
  domena?: string | null;
  od: Date;
  rodzaj: 'zakup' | 'odnowienie';
}): string {
  const okres =
    u.rodzaj === 'odnowienie'
      ? `odnowienie ${u.interval === 'YEAR' ? 'roczne' : 'miesięczne'}`
      : u.interval === 'YEAR'
        ? '12 mies.'
        : '1 mies.';
  return (
    `${u.plan} — ${okres}` +
    (u.domena ? ` (${u.domena})` : '') +
    `, okres ${dataPl(u.od)}–${dataPl(koniecOkresu(u.od, u.interval))}`
  ).slice(0, MAKS_NAZWA_POZYCJI);
}

/** Nazwy pozycji zapisanych w JSON-ie (proforma, faktura) połączone w jedną — null, gdy brak nazw. */
export function nazwyPozycji(lineItems: unknown): string | null {
  if (!Array.isArray(lineItems)) return null;
  const nazwy = lineItems
    .map((p) => (p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name.trim() : ''))
    .filter(Boolean);
  return nazwy.length ? nazwy.join('; ') : null;
}
