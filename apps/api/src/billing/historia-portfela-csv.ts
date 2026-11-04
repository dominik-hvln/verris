import { WALLET_TX_STATUS_PL, etykietaWpisuPortfela } from '@verris/contracts';
import { neutralizujFormule } from './csv.util.js';

/** Pole CSV z separatorem „;”: neutralizacja formuł arkusza i cudzysłowy, gdy trzeba. */
function pole(v: string): string {
  const t = neutralizujFormule(v);
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * P2-10 (beta 3.11) — historia portfela dla klienta i jego księgowej. Wcześniej klient dostawał zrzut techniczny
 * operatora: angielskie nagłówki, `userId`, `idempotencyKey`, `PROMO_CREDIT`, czas w UTC, bez dokumentu i VAT.
 * Teraz: polskie kolumny, czas polski, kwoty z przecinkiem, separator „;” (Excel w polskich ustawieniach),
 * numer dokumentu oraz netto i VAT z dokumentu za wpłatę. Bez identyfikatorów technicznych i nazw operatorów płatności.
 * Eksport operatora (`exportTransactionsCsv`) zostaje bez zmian.
 */
export interface WierszHistorii {
  createdAt: Date;
  type: string;
  status: string;
  amount: { toFixed(n: number): string };
  balanceAfter: { toFixed(n: number): string };
  currency: string;
  description: string | null;
  invoice: {
    number: string;
    externalInvoiceNumber: string | null;
    netAmount: { toFixed(n: number): string } | null;
    vatAmount: { toFixed(n: number): string } | null;
  } | null;
}

const NAGLOWKI = [
  'Data',
  'Operacja',
  'Opis',
  'Kwota (zł = K)',
  'Saldo po (K)',
  'Stan',
  'Numer dokumentu',
  'Netto dokumentu (zł)',
  'VAT dokumentu (zł)',
];

const CZAS_PL = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** „2026-11-03 00:08” w strefie Polski. */
export function czasPolski(d: Date): string {
  const cz = Object.fromEntries(CZAS_PL.formatToParts(d).map((p) => [p.type, p.value]));
  return `${cz.year}-${cz.month}-${cz.day} ${cz.hour}:${cz.minute}`;
}

/**
 * Opis wpisu po ludzku — ta sama reguła co w panelu (`apps/client-panel/src/lib/wallet-tx-label.ts`): bez
 * identyfikatorów, bez angielskich opisów technicznych, bez nazwy operatora kart.
 */
export function opisDlaKlienta(opis: string | null): string {
  const d = (opis ?? '').trim();
  if (!d) return '';
  const odn = d.match(/^auto-renewal\s+(\S+)\s*\((month|year)\)/i);
  if (odn) return `Odnowienie ${odn[2]!.toLowerCase() === 'month' ? 'miesięczne' : 'roczne'} · ${odn[1]!.replace(/-/g, ' ')}`;
  if (/^subscription\s+[0-9a-f-]{16,}\s*\(initial payment\)/i.test(d)) return 'Pierwsza opłata za usługę';
  if (/^subscription\s+[0-9a-f-]{16,}/i.test(d)) return 'Opłata za usługę';
  if (/^auto-refund: provisioning failed/i.test(d)) return 'Zwrot — usługi nie udało się uruchomić';
  if (/^refund/i.test(d)) return 'Zwrot środków';
  const dol = d.match(/^doładowanie\s+(\w+)/i);
  if (dol) return /^stripe$/i.test(dol[1]!) ? 'Doładowanie kartą' : `Doładowanie — ${dol[1]}`;
  return d.replace(/\s*[([]?\b[0-9a-f]{8}-[0-9a-f-]{8,}\b[)\]]?/gi, '').replace(/\s{2,}/g, ' ').trim();
}

const kwota = (v: { toFixed(n: number): string } | null | undefined) => (v ? v.toFixed(2).replace('.', ',') : '');

export function historiaPortfelaCsv(wiersze: readonly WierszHistorii[]): string {
  const linie = [NAGLOWKI.join(';')];
  for (const r of wiersze) {
    linie.push(
      [
        czasPolski(r.createdAt),
        etykietaWpisuPortfela(r.type, r.amount.toFixed(2)),
        opisDlaKlienta(r.description),
        kwota(r.amount),
        kwota(r.balanceAfter),
        (WALLET_TX_STATUS_PL as Record<string, string>)[r.status] ?? r.status,
        r.invoice ? (r.invoice.externalInvoiceNumber ?? r.invoice.number) : '',
        kwota(r.invoice?.netAmount),
        kwota(r.invoice?.vatAmount),
      ]
        .map(pole)
        .join(';'),
    );
  }
  // BOM — Excel w Windows otwiera UTF-8 z polskimi znakami poprawnie.
  return '﻿' + linie.join('\r\n') + '\r\n';
}

export function nazwaPlikuHistorii(teraz = new Date()): string {
  return `historia-portfela-${czasPolski(teraz).slice(0, 10)}.csv`;
}
