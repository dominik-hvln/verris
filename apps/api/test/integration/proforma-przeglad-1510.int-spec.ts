import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DoladowanieService } from '../../src/billing/doladowanie.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { ProformaService } from '../../src/billing/proforma.service.js';
import { RozliczeniaOperatoraService } from '../../src/billing/rozliczenia-operatora.service.js';
import { podpisPowiadomienia } from '../../src/billing/paynow/paynow.client.js';
import { traktowanieZKodu } from '../../src/billing/vat.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { ZmianaWlascicielaService } from '../../src/subscriptions/zmiana-wlasciciela.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Przegląd 15.10 (proformy K4) — proforma „odnowienie” nie była związana z okresem ani stanem usługi; zmiana właściciela
 * nie widziała proformy opłaconej, a niewykorzystanej. Każdy przypadek czerwony na kodzie sprzed poprawki.
 */
const SIG = 'sig-key-przeglad';
const mailer = { send: async () => undefined };
const OP = { userId: '00000000-0000-4000-8000-0000000000f1', role: 'STAFF' };
const DZIEN = 86_400_000;

function serwisy() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const vat = { ustal: async () => ({ traktowanie: traktowanieZKodu('PL', 23, 'PL')!, vies: null }) };
  const doladowanie = new DoladowanieService(p, ledger, vat as never);
  const cfg: Record<string, string> = {
    paynowApiKey: 'api-key', paynowSignatureKey: SIG, paynowApiUrl: 'https://api.sandbox.paynow.pl', clientPanelUrl: 'https://panel.test',
  };
  const config = { get: (k: string) => cfg[k] } as never;
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const billing = new BillingService(
    p, ledger, null as never, audit, config, null as never, null as never, mailer as never, promo,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
    doladowanie,
  );
  const invoices = {
    buildSellerSnapshot: async () => ({ name: 'Verris', nip: '1234567890', address: 'ul. A 1', city: 'Poznań', postalCode: '60-001', country: 'PL', email: 'k@v.pl' }),
    buildBuyerSnapshot: async () => ({ name: 'Klient', email: 'k@x.pl' }),
  };
  const proforma = new ProformaService(p, promo, null as never, invoices as never, vat as never, audit, mailer as never, config);
  const rozliczenia = new RozliczeniaOperatoraService(p, ledger, doladowanie, billing, audit, null as never, promo);
  const subs = { finalizeScheduledCancellation: async () => null, suspend: async () => undefined, unsuspend: async () => undefined };
  const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };
  const harmonogram = new RenewalScheduler(p, ledger, subs as never, audit, promo, eco as never);
  const zmiana = new ZmianaWlascicielaService(p, mailer as never, config);
  return { billing, proforma, rozliczenia, harmonogram, zmiana };
}

let n = 0;
const klient = async (saldo = 0) => {
  n += 1;
  return prisma().user.create({
    data: { email: `prz-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo, emailVerifiedAt: new Date() },
  });
};
const usluga = async (userId: string, koniecZa: number) => {
  const plan = await utworzPlan();
  return prisma().subscription.create({
    data: {
      userId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, listPriceAmount: 45, currency: 'PLN',
      paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 20 * DZIEN), currentPeriodEnd: new Date(Date.now() + koniecZa),
    } as never,
  });
};
let nr = 0;
async function zaplacPaynow(b: BillingService, fetchMock: ReturnType<typeof vi.fn>, userId: string, proformaId: string) {
  nr += 1;
  const paymentId = `PRZ-AAA-BBB-${String(nr).padStart(3, '0')}`;
  fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ redirectUrl: `https://paywall.test/${paymentId}`, paymentId, status: 'NEW' }) });
  await b.zaplacProforme(userId, proformaId);
  const rek = await prisma().paynowPlatnosc.findUniqueOrThrow({ where: { paymentId } });
  const raw = Buffer.from(JSON.stringify({ paymentId, externalId: rek.id, status: 'CONFIRMED', modifiedAt: '2026-10-15T10:00:00' }));
  await b.handlePaynowNotification(raw, podpisPowiadomienia(SIG, raw));
}
const dokumentyOdnowienia = async (userId: string) =>
  (await prisma().invoice.findMany({ where: { userId } })).filter((d) => JSON.stringify(d.lineItems).includes('odnowienie'));

afterAll(rozlacz);

describe('Przegląd 15.10 — proforma na odnowienie związana z okresem i stanem usługi', () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    await wyczyscBaze();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('F1a: dwie proformy na to samo odnowienie, obie opłacone przelewem → dwa dokumenty „odnowienie” za ten sam okres', async () => {
    const k = await klient(0);
    const sub = await usluga(k.id, 12 * 3600_000);
    const { proforma, rozliczenia, harmonogram } = serwisy();
    const a = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    // drugi operator / ten sam operator po „mail nie wyszedł” — nic tego nie blokuje
    const b = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id }).catch(() => null);
    for (const [i, pf] of [a, b].entries()) {
      if (!pf) continue;
      await rozliczenia.zaksiegujPrzelew({ userId: k.id, operator: OP, kwota: 45, tytul: `Proforma ${pf.numer}`, referencja: `BANK-PRZ-${i}`, dataWplaty: new Date(), proformaId: pf.id }).catch(() => null);
    }
    await harmonogram.handleHourlyTick();
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
    // Jedno odnowienie = najwyżej jedna opłacona proforma „odnowienie” i jeden dokument nazwany odnowieniem tego okresu.
    expect(await prisma().proforma.count({ where: { subscriptionId: sub.id, status: 'OPLACONA' } })).toBeLessThanOrEqual(1);
    expect(await dokumentyOdnowienia(k.id)).toHaveLength(1);
  });

  it('F1b: odnowienie już pobrane z portfela, potem klient płaci proformę → druga zapłata i dokument „odnowienie” za opłacony okres', async () => {
    const k = await klient(45);
    const sub = await usluga(k.id, 12 * 3600_000);
    const { billing, proforma, harmonogram } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    await harmonogram.handleHourlyTick(); // odnowienie z salda, które klient już miał
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } })).currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 25 * DZIEN);
    await zaplacPaynow(billing, fetchMock, k.id, w.id).catch(() => null);
    // Oczekiwane: proforma nieaktualna (okres już opłacony) — „Zapłać” odmawia albo wpłata nie jest księgowana jako odnowienie.
    expect(await dokumentyOdnowienia(k.id)).toHaveLength(0);
    expect((await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } })).status).not.toBe('OPLACONA');
  });

  it('F1c: zmiana ceny/planu po wystawieniu → klient płaci pełną proformę, a usługa ląduje w PAST_DUE', async () => {
    const k = await klient(0);
    const sub = await usluga(k.id, 12 * 3600_000);
    const { billing, proforma, harmonogram } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    // plan-change.service.ts:722 — zmiana planu zapisuje nową cenę, proformy nie rusza
    await prisma().subscription.update({ where: { id: sub.id }, data: { priceAmount: 89, listPriceAmount: 89 } });
    await zaplacPaynow(billing, fetchMock, k.id, w.id).catch(() => null);
    await harmonogram.handleHourlyTick();
    const pf = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    const po = await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } });
    // Niezmiennik: proforma „odnowienie” OPŁACONA ⇒ usługa odnowiona.
    expect({ proforma: pf.status, usluga: po.status }).not.toEqual({ proforma: 'OPLACONA', usluga: 'PAST_DUE' });
  });

  it('F1d: rezygnacja na koniec okresu po wystawieniu → proforma dalej płatna, dokument „odnowienie”, odnowienia nie będzie', async () => {
    const k = await klient(0);
    const sub = await usluga(k.id, 12 * 3600_000);
    const { billing, proforma, harmonogram } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    await prisma().subscription.update({ where: { id: sub.id }, data: { cancelAt: sub.currentPeriodEnd } });
    await zaplacPaynow(billing, fetchMock, k.id, w.id).catch(() => null);
    await harmonogram.handleHourlyTick();
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(0);
    expect(await dokumentyOdnowienia(k.id)).toHaveLength(0);
  });

  it('F2: zmiana właściciela po opłaceniu proformy, przed odnowieniem — brak odmowy (liczone tylko WYSTAWIONA)', async () => {
    const k = await klient(0);
    const nowy = await klient(0);
    const sub = await usluga(k.id, 20 * DZIEN);
    const { billing, proforma, zmiana } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    await zaplacPaynow(billing, fetchMock, k.id, w.id);
    expect((await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } })).status).toBe('OPLACONA');
    const { odmowy } = await zmiana.podglad(sub.id, nowy.email);
    // Komentarz zmiana-wlasciciela.service.ts:119: „poprzedni zapłaciłby za nic, nowy dostałby zaległość” — dotyczy też
    // proformy opłaconej, której wpłata nie została jeszcze zużyta przez odnowienie.
    expect(odmowy.some((o) => o.toLowerCase().includes('proform'))).toBe(true);
  });
});
