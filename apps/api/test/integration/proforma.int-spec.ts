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
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * K4 (PB-53.6) — proforma z linkiem do płatności na prawdziwym Postgresie: wystawienie (seria PRO), „Zapłać” → Paynow →
 * powiadomienie → dokument za wpłatę istniejącą ścieżką + proforma OPŁACONA atomowo; podwójne powiadomienie = jedna
 * wpłata i jeden dokument; anulowanie (wpłata po anulowaniu nie opłaca proformy); przelew zaksięgowany przez Finanse;
 * odnowienie usługi przez istniejący harmonogram. Atrapy: Paynow (fetch), mailer, EKO.
 */
const SIG = 'sig-key-k4';
const maile: Array<{ to: string; subject: string; text: string }> = [];
const mailer = { send: async (m: { to: string; subject: string; text: string }) => void maile.push(m) };
const OP = { userId: '00000000-0000-4000-8000-0000000000f1', role: 'STAFF' };

function serwisy() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const vat = { ustal: async () => ({ traktowanie: traktowanieZKodu('PL', 23, 'PL')!, vies: null }) };
  const doladowanie = new DoladowanieService(p, ledger, vat as never);
  const cfg: Record<string, string> = {
    paynowApiKey: 'api-key-k4', paynowSignatureKey: SIG, paynowApiUrl: 'https://api.sandbox.paynow.pl', clientPanelUrl: 'https://panel.test',
  };
  const config = { get: (k: string) => cfg[k] } as never;
  // Przegląd 15.10: „Zapłać” przy proformie „odnowienie” liczy aktualną kwotę odnowienia — BillingService dostaje PromoService.
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
  return { billing, proforma, rozliczenia, ledger, audit, promo };
}

let n = 0;
const klient = async (saldo = 0) => {
  n += 1;
  return prisma().user.create({ data: { email: `k4-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
};
const saldo = async (id: string) => (await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance.toFixed(2);
const pid = (i: number) => `K4PF-AAA-BBB-${String(i).padStart(3, '0')}`;

/** „Zapłać” w panelu klienta → zlecenie w Paynow (atrapa fetch) → rekord PaynowPlatnosc z paymentId. */
async function zaplac(b: BillingService, fetchMock: ReturnType<typeof vi.fn>, userId: string, proformaId: string, paymentId: string) {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ redirectUrl: `https://paywall.test/${paymentId}`, paymentId, status: 'NEW' }) });
  const { url } = await b.zaplacProforme(userId, proformaId);
  expect(url).toBe(`https://paywall.test/${paymentId}`);
  return prisma().paynowPlatnosc.findUniqueOrThrow({ where: { paymentId } });
}
const powiadomienie = (externalId: string, paymentId: string) => {
  const raw = Buffer.from(JSON.stringify({ paymentId, externalId, status: 'CONFIRMED', modifiedAt: '2026-10-12T10:00:00' }));
  return [raw, podpisPowiadomienia(SIG, raw)] as const;
};

describe('K4 — proforma z linkiem do płatności', () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(rozlacz);

  it('wystawienie → Zapłać → 2× powiadomienie + sprawdzenie równocześnie: jedna wpłata, jeden dokument z numerem proformy, OPŁACONA', async () => {
    const k = await klient(5);
    const { billing, proforma } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, pozycje: [{ nazwa: 'Konfiguracja poczty', kwotaBrutto: 7.38 }] });
    expect(w.numer).toMatch(/^PRO\/\d{4}\/\d{2}\/0001$/);
    expect(maile).toHaveLength(1);
    expect(maile[0].text).toContain(`https://panel.test/dashboard/billing?proforma=${w.id}`);
    const pf0 = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    expect([pf0.status, pf0.amount.toFixed(2), pf0.netAmount.toFixed(2), pf0.vatAmount.toFixed(2)]).toEqual(['WYSTAWIONA', '7.38', '6.00', '1.38']);

    const rek = await zaplac(billing, fetchMock, k.id, w.id, pid(1));
    expect(rek.kwotaMinor).toBe(738);
    expect(rek.meta).toMatchObject({ kind: 'proforma', proformaId: w.id, vatKod: 'PL' });

    const [raw, podpis] = powiadomienie(rek.id, pid(1));
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ paymentId: pid(1), status: 'CONFIRMED' }) });
    const wyniki = await Promise.allSettled([
      billing.handlePaynowNotification(raw, podpis),
      billing.handlePaynowNotification(raw, podpis),
      billing.sprawdzPlatnoscPaynow(k.id, rek.id),
    ]);
    expect(wyniki.some((x) => x.status === 'fulfilled')).toBe(true);
    await billing.handlePaynowNotification(raw, podpis); // ponowienie Paynow po ewentualnym błędzie przegranego

    const wpisy = await prisma().walletTransaction.findMany({ where: { userId: k.id, type: WalletTxType.TOPUP } });
    expect(wpisy).toHaveLength(1);
    expect(await saldo(k.id)).toBe('12.38');
    const dokumenty = await prisma().invoice.findMany({ where: { userId: k.id } });
    expect(dokumenty).toHaveLength(1);
    // Dokument z istniejącej ścieżki (przy doładowaniu, domyślnie dokument rozliczeniowy VDR) — numer z serii dokumentów,
    // nie z serii proform; liczniki rozłączne (obie serie zaczynają od 0001).
    expect(dokumenty[0]).toMatchObject({ provider: 'WALLET_TOPUP', providerRef: wpisy[0].id, rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY' });
    expect(dokumenty[0].number).toMatch(/^VDR\/\d{4}\/\d{2}\/0001$/);
    expect(dokumenty[0].amount.toFixed(2)).toBe('7.38');
    expect(dokumenty[0].vatAmount?.toFixed(2)).toBe('1.38');
    // 2026-10-12: proforma opłacona dokładną kwotą — dokument nazywa to, za co była proforma, z jej numerem.
    expect((dokumenty[0].lineItems as Array<{ name: string }>)[0].name).toBe(`Konfiguracja poczty (proforma ${w.numer})`);
    // Proforma nie jest w tabeli dokumentów sprzedaży — wysyłka do KSeF (Invoice) jej nie widzi.
    expect(await prisma().invoice.count({ where: { number: { startsWith: 'PRO/' } } })).toBe(0);

    const pf = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    expect(pf).toMatchObject({ status: 'OPLACONA', walletTxId: wpisy[0].id, invoiceId: dokumenty[0].id });
    expect(pf.paidAt).not.toBeNull();
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'PROFORMA_OPLACONA' } })).toBe(1);
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'WALLET_TOPUP_COMPLETED' } })).toBe(1);

    // Opłacona: drugie „Zapłać” i anulowanie — odmowa.
    await expect(billing.zaplacProforme(k.id, w.id)).rejects.toThrow('już opłacona');
    await expect(proforma.anuluj({ id: w.id, operator: OP, powod: 'pomyłka operatora przy kwocie' })).rejects.toThrow('nie można anulować');
    // Cudza proforma — 404.
    const obcy = await klient();
    await expect(billing.zaplacProforme(obcy.id, w.id)).rejects.toThrow('Nie znaleziono proformy');
  });

  it('anulowanie: Zapłać odrzucone; wpłata rozpoczęta przed anulowaniem wchodzi do portfela, proforma zostaje ANULOWANA, Finanse dostają alarm', async () => {
    const k = await klient();
    await prisma().user.create({ data: { email: `k4-admin-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const { billing, proforma } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, pozycje: [{ nazwa: 'Usługa jednorazowa', kwotaBrutto: 2.46 }] });
    const rek = await zaplac(billing, fetchMock, k.id, w.id, pid(2));

    await proforma.anuluj({ id: w.id, operator: OP, powod: 'klient zapłaci w innym terminie' });
    expect(maile.map((m) => m.subject).some((s) => s.includes('anulowana'))).toBe(true);
    await expect(billing.zaplacProforme(k.id, w.id)).rejects.toThrow('anulowana');
    await expect(proforma.anuluj({ id: w.id, operator: OP, powod: 'drugi raz to samo anulowanie' })).rejects.toThrow('nie można anulować');

    const [raw, podpis] = powiadomienie(rek.id, pid(2));
    await billing.handlePaynowNotification(raw, podpis);
    expect(await saldo(k.id)).toBe('2.46');
    const pf = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    expect(pf).toMatchObject({ status: 'ANULOWANA', walletTxId: null, invoiceId: null, cancelReason: 'klient zapłaci w innym terminie' });
    const dok = await prisma().invoice.findFirstOrThrow({ where: { userId: k.id } });
    expect(JSON.stringify(dok.lineItems)).not.toContain('proformy');
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'PROFORMA_WPLATA_NIEPRZYPISANA' } })).toBe(1);
    expect(await prisma().notification.count({ where: { title: { contains: 'proformy' } } })).toBe(1);
  });

  it('wyścig: anulowanie i powiadomienie o wpłacie równocześnie — dokładnie jedno wygrywa, stan spójny', async () => {
    for (let i = 0; i < 4; i += 1) {
      const k = await klient();
      const { billing, proforma } = serwisy();
      const w = await proforma.wystaw({ userId: k.id, operator: OP, pozycje: [{ nazwa: 'Usługa', kwotaBrutto: 3 }] });
      const rek = await zaplac(billing, fetchMock, k.id, w.id, pid(10 + i));
      const [raw, podpis] = powiadomienie(rek.id, pid(10 + i));
      const [anul] = await Promise.allSettled([
        proforma.anuluj({ id: w.id, operator: OP, powod: 'anulowanie w trakcie płatności' }),
        billing.handlePaynowNotification(raw, podpis),
      ]);
      const pf = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
      if (anul.status === 'fulfilled') {
        expect(pf).toMatchObject({ status: 'ANULOWANA', walletTxId: null });
      } else {
        expect(pf.status).toBe('OPLACONA');
        expect(pf.walletTxId).not.toBeNull();
      }
      expect(await saldo(k.id)).toBe('3.00');
    }
  });

  it('przelew zaksięgowany przez Finanse do proformy: zła kwota odrzucona, dobra opłaca; ten sam przelew drugi raz nic nie zmienia', async () => {
    const k = await klient();
    const { proforma, rozliczenia } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, pozycje: [{ nazwa: 'Wdrożenie sklepu', kwotaBrutto: 123 }, { nazwa: 'Szkolenie', kwotaBrutto: 0.5 }] });
    const pf0 = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    expect([pf0.amount.toFixed(2), pf0.netAmount.toFixed(2), pf0.vatAmount.toFixed(2)]).toEqual(['123.50', '100.41', '23.09']);
    const przelew = { userId: k.id, operator: OP, tytul: `Proforma ${w.numer}`, referencja: 'BANK-K4-0001', dataWplaty: new Date(), proformaId: w.id };

    await expect(rozliczenia.zaksiegujPrzelew({ ...przelew, kwota: 100 })).rejects.toThrow('różni się od kwoty proformy');
    expect(await saldo(k.id)).toBe('0.00');

    const wyniki = await Promise.allSettled([1, 2, 3].map(() => rozliczenia.zaksiegujPrzelew({ ...przelew, kwota: 123.5 })));
    expect(wyniki.every((x) => x.status === 'fulfilled')).toBe(true);
    const nowe = wyniki.filter((x) => x.status === 'fulfilled' && !x.value.duplikat);
    expect(nowe).toHaveLength(1);
    expect((nowe[0] as PromiseFulfilledResult<{ komunikat: string }>).value.komunikat).toContain(`Proforma ${w.numer} opłacona`);
    expect(await saldo(k.id)).toBe('123.50');
    const pf = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    const dok = await prisma().invoice.findFirstOrThrow({ where: { userId: k.id } });
    expect(pf).toMatchObject({ status: 'OPLACONA', invoiceId: dok.id });
    expect(dok.amount.toFixed(2)).toBe('123.50');
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'PROFORMA_OPLACONA' } })).toBe(1);

    // Druga wpłata do opłaconej proformy — odmowa przed księgowaniem.
    await expect(rozliczenia.zaksiegujPrzelew({ ...przelew, referencja: 'BANK-K4-0002', kwota: 123.5 })).rejects.toThrow('nie jest do zapłaty');
  });

  it('odnowienie usługi z portfela: proforma na kwotę odnowienia, po wpłacie odnawia istniejący harmonogram — jedno obciążenie, jeden dokument', async () => {
    const k = await klient(0);
    const plan = await utworzPlan();
    const sub = await prisma().subscription.create({
      data: {
        userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
        paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 29 * 86400000), currentPeriodEnd: new Date(Date.now() + 12 * 3600000),
      } as never,
    });
    const { billing, proforma, ledger, audit, promo } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    const pf0 = await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } });
    expect(pf0.amount.toFixed(2)).toBe('45.00');
    expect(pf0.subscriptionId).toBe(sub.id);

    const rek = await zaplac(billing, fetchMock, k.id, w.id, pid(3));
    const [raw, podpis] = powiadomienie(rek.id, pid(3));
    await billing.handlePaynowNotification(raw, podpis);
    expect(await saldo(k.id)).toBe('45.00');

    const subs = { finalizeScheduledCancellation: async () => null, suspend: async () => undefined, unsuspend: async () => undefined };
    const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };
    const harmonogram = new RenewalScheduler(prisma() as never, ledger, subs as never, audit, promo, eco as never);
    await harmonogram.handleHourlyTick();
    await harmonogram.handleHourlyTick();
    expect(await saldo(k.id)).toBe('0.00');
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
    const po = await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(po.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
    // Model „przy doładowaniu”: dokument powstał przy wpłacie, obciążenie portfela drugiego nie tworzy.
    expect(await prisma().invoice.count({ where: { userId: k.id } })).toBe(1);
    expect((await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } })).status).toBe('OPLACONA');
  });

  // Decyzja 15.10 (#7): płatność rozpoczęta przed zmianą usługi i zaksięgowana po niej nie opłaca proformy na stary okres.
  it('wpłata do proformy „odnowienie” po odnowieniu okresu z salda: zwykłe doładowanie, proforma nieopłacona, alarm', async () => {
    const k = await klient(0);
    await prisma().user.create({ data: { email: `k4-admin-7-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const plan = await utworzPlan();
    const koniec = new Date(Date.now() + 12 * 3600000);
    const sub = await prisma().subscription.create({
      data: {
        userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
        paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 29 * 86400000), currentPeriodEnd: koniec,
      } as never,
    });
    const { billing, proforma } = serwisy();
    const w = await proforma.wystaw({ userId: k.id, operator: OP, odnowienieSubscriptionId: sub.id });
    expect((await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } })).okresOd?.getTime()).toBe(koniec.getTime());
    const rek = await zaplac(billing, fetchMock, k.id, w.id, pid(7));

    // Zanim Paynow potwierdził wpłatę, okres odnowiono z salda (np. doładowanie kartą) — proforma opisuje stary okres.
    await prisma().subscription.update({ where: { id: sub.id }, data: { currentPeriodStart: koniec, currentPeriodEnd: new Date(koniec.getTime() + 30 * 86400000) } });
    const [raw, podpis] = powiadomienie(rek.id, pid(7));
    await billing.handlePaynowNotification(raw, podpis);

    expect(await saldo(k.id)).toBe('45.00');
    expect(await prisma().proforma.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: 'WYSTAWIONA', walletTxId: null });
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'PROFORMA_WPLATA_NIEPRZYPISANA' } })).toBe(1);
  });
});
