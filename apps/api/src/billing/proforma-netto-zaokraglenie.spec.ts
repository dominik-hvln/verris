/**
 * PRZEGLĄD 12.10 — K4: proforma na odnowienie dla klienta rozliczanego netto (cenaNetto) — wpłata kwoty z proformy
 * daje o 0,01 K mniej niż kosztuje odnowienie (ok. 9% kwot; np. 40,30 / 36,45 / 44,95 K).
 * Uruchom: cd apps/api && npx vitest run src/billing/proforma-netto-zaokraglenie.spec.ts
 *
 * Przed poprawką CZERWONY: proforma.service.ts:145-147 liczy doZaplaty = round_half_up(K / 1,23, 2), a księgowanie wpłaty
 * (vat.ts kredytZaWplate) daje round_half_up(doZaplaty × 1,23, 2). Dla K = 40,30: 32,76 zł → 40,29 K. Klient opłaca proformę,
 * portfel ma 40,29 K, harmonogram (renewal.scheduler.ts attemptRenewal) nie obciąży 40,30 → PAST_DUE, przy karencji 0 dni
 * zawieszenie w następnym przebiegu po końcu okresu.
 */
import { Prisma } from '@verris/database';
import { ProformaService } from './proforma.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { kredytZaWplate } from './vat.js';

function zbuduj(K: string) {
  const sub = {
    id: 'abcdef12-0000-0000-0000-000000000000', userId: 'u1', status: 'ACTIVE', cancelAt: null,
    currentPeriodEnd: new Date('2026-10-01T00:00:00Z'), interval: 'MONTH', currency: 'PLN', paymentSource: 'WALLET',
    priceAmount: new Prisma.Decimal(K), listPriceAmount: null, appliedPromoCodeId: null, introDiscountPct: 0, introDiscountPeriodsLeft: 0,
    plan: { name: 'Hosting' }, account: { domain: 'firma.de' },
  };
  const prisma = { subscription: { findFirst: vi.fn(async () => sub) } };
  const promo = { resolveNextRenewalAmount: vi.fn(async () => new Prisma.Decimal(K)) };
  const pdf = new InvoicePdfService({ get: () => undefined } as never);
  const render = vi.spyOn(pdf, 'render');
  const invoices = { buildSellerSnapshot: vi.fn(async () => ({ name: 'Verris', nip: '1', address: 'a', city: 'c', postalCode: '00-000', country: 'PL', email: 'k@v.pl' })), buildBuyerSnapshot: vi.fn(async () => ({ name: 'Firma GmbH', email: 'u1@x.de' })) };
  // Klient z UE z odwrotnym obciążeniem: płaci netto, K = wpłata × 1,23.
  const traktowanie = { kod: 'NP_UE', stawka: null, cenaNetto: true, adnotacja: 'odwrotne obciążenie' };
  const vat = { ustal: vi.fn(async () => ({ traktowanie, vies: null })) };
  return { s: new ProformaService(prisma as never, promo as never, pdf, invoices as never, vat as never), sub, render, traktowanie };
}

describe('K4 — proforma netto pokrywa odnowienie (przegląd 12.10)', () => {
  it.each(['40.30', '36.45', '44.95', '45.00', '449.00'])('K = %s: wpłata kwoty z proformy daje co najmniej K', async (K) => {
    const { s, sub, render, traktowanie } = zbuduj(K);
    await s.render('u1', sub.id);
    const doZaplaty = new Prisma.Decimal(render.mock.calls[0]![0].totalGross);
    expect(kredytZaWplate(doZaplaty, traktowanie).gte(new Prisma.Decimal(K))).toBe(true);
  });
});
