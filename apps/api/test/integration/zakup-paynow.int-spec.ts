import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DoladowanieService } from '../../src/billing/doladowanie.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { traktowanieZKodu } from '../../src/billing/vat.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { podpisPowiadomienia } from '../../src/billing/paynow/paynow.client.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * 2026-10-12 (Dominik) — zakup usługi przez Paynow na prawdziwym Postgresie: zamówienie → płatność za pełną cenę →
 * powiadomienie CONFIRMED (dwa razy) → jedna wpłata, jeden dokument z NAZWĄ USŁUGI i okresem (nie „Doładowanie
 * konta”), jedno obciążenie za usługę oznaczone jako pokryte dokumentem za wpłatę, usługa w zakładaniu.
 * Atrapy: Paynow (fetch), kolejka zakładania, mailer, EKO.
 */
const SIG = 'sig-key-zakup';
const PID = 'ZKP-111-222-333';
const pusty = new Proxy({}, { get: () => async () => undefined }) as never;
const kolejka: string[] = [];

function serwisy() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: vi.fn(async () => undefined) };
  const vat = { ustal: async () => ({ traktowanie: traktowanieZKodu('PL', 23, 'PL')!, vies: null }) };
  const doladowanie = new DoladowanieService(p, ledger, vat as never);
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = { isAsync: () => true, enqueueWalletProvision: async (o: { subscriptionId: string }) => void kolejka.push(o.subscriptionId) };
  const subscriptions = new SubscriptionsService(
    p, audit, ledger, null as never, { sprawdzMiejsce: async () => undefined } as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, { safeAward: () => undefined } as never,
    { getTrialOffer: async () => ({ cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 }) } as never, null as never,
  );
  const cfg: Record<string, string> = {
    paynowApiKey: 'api-key-zakup', paynowSignatureKey: SIG, paynowApiUrl: 'https://api.sandbox.paynow.pl', clientPanelUrl: 'https://panel.test',
  };
  // Osobny mailer billingu — zamówienie wysyła własny mail „przyjęliśmy zamówienie” (SubscriptionsService).
  const mailerBillingu = { send: vi.fn(async () => undefined) };
  const billing = new BillingService(
    p, ledger, null as never, audit, { get: (k: string) => cfg[k] } as never, null as never, subscriptions, mailerBillingu as never, pusty,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
    doladowanie,
  );
  return { billing, subscriptions, mailer: mailerBillingu };
}

describe('Zakup usługi przez Paynow na Postgresie', () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    await wyczyscBaze();
    kolejka.length = 0;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(rozlacz);

  it('jedna wpłata, dokument z nazwą usługi i okresem, jedno obciążenie pokryte dokumentem, usługa w zakładaniu', async () => {
    const { billing, subscriptions, mailer } = serwisy();
    const u = await prisma().user.create({ data: { email: `zakup-pn-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ name: 'Hosting Start', priceYearly: 468 } as never);
    const { subscription, doZaplatyPaynow } = await subscriptions.create(u.id, {
      planId: plan.id, interval: 'YEAR', paymentSource: 'WALLET', oplata: 'PAYNOW', domain: 'przyklad.pl', immediatePerformanceConsent: true,
    } as never);
    expect(doZaplatyPaynow?.kwotaK.toFixed(2)).toBe('468.00');

    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ redirectUrl: 'https://paywall/x', paymentId: PID, status: 'NEW' }) });
    await billing.zaplacZamowieniePaynow(u.id, { subscriptionId: subscription.id, kwotaK: doZaplatyPaynow!.kwotaK, domena: 'przyklad.pl' });
    const rek = await prisma().paynowPlatnosc.findFirstOrThrow({ where: { userId: u.id } });
    expect(rek.kwotaMinor).toBe(46800);

    const raw = Buffer.from(JSON.stringify({ paymentId: PID, externalId: rek.id, status: 'CONFIRMED' }));
    const podpis = podpisPowiadomienia(SIG, raw);
    await billing.handlePaynowNotification(raw, podpis);
    await billing.handlePaynowNotification(raw, podpis);

    const dokumenty = await prisma().invoice.findMany({ where: { userId: u.id } });
    expect(dokumenty).toHaveLength(1);
    const [pozycja] = dokumenty[0].lineItems as Array<{ name: string; totalGross: string }>;
    expect(pozycja.name).toMatch(/^Hosting Start — 12 mies\. \(przyklad\.pl\), okres \d{2}\.\d{2}\.\d{4}–\d{2}\.\d{2}\.\d{4}$/);
    expect(pozycja.name).not.toContain('Doładowanie');
    expect(pozycja.totalGross).toBe('468.00');

    const wpisy = await prisma().walletTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(wpisy.map((w) => w.type)).toEqual([WalletTxType.TOPUP, WalletTxType.CHARGE_SUBSCRIPTION]);
    // m34: obciążenie pokryte dokumentem za wpłatę — nie trafi drugi raz na fakturę.
    expect(wpisy[1].metadata).toMatchObject({ m34: expect.anything() });
    expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).walletBalance.toFixed(2)).toBe('0.00');
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status).toBe(SubscriptionStatus.PROVISIONING);
    expect(kolejka).toEqual([subscription.id]);
    expect(await prisma().auditLog.count({ where: { action: 'ZAMOWIENIE_PAYNOW_ZREALIZOWANE' } })).toBe(1);
    // Klient kupował usługę, nie doładowywał portfela — bez maila „doładowano portfel”.
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
