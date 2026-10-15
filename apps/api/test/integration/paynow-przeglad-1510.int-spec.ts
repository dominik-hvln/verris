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
 * Przegląd 15.10 — ścieżka zakupu przez Paynow i rabat na start (zmiany z 14.10 bez niezależnego przeglądu).
 * Każdy przypadek był czerwony na kodzie sprzed poprawki.
 */
const SIG = 'sig-key-przeglad';
const pusty = new Proxy({}, { get: () => async () => undefined }) as never;
const kolejka: string[] = [];
let kolejkaPada = false;
let oferta: Record<string, unknown> = { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 };
/** Bariera na obciążeniu za usługę: oba równoległe przebiegi przechodzą kontrole, zanim pierwszy obciąży. */
let bariera: { czekaj: number; zwolnij?: () => void; p?: Promise<void>; pierwszyGotowy?: Promise<void>; pierwszyKoniec?: () => void } | null = null;

class LedgerZBariera extends WalletLedgerService {
  override async debit(input: Parameters<WalletLedgerService['debit']>[0]) {
    if (bariera && input.type === WalletTxType.CHARGE_SUBSCRIPTION) {
      const b = bariera;
      b.czekaj -= 1;
      if (b.czekaj > 0) {
        await b.p; // pierwszy czeka, aż drugi też przejdzie kontrole
        const w = await super.debit(input);
        b.pierwszyKoniec?.();
        return w;
      }
      b.zwolnij?.();
      await b.pierwszyGotowy; // drugi obciąża dopiero po pierwszym
      return super.debit(input);
    }
    return super.debit(input);
  }
}

function serwisy() {
  const p = prisma() as never;
  const ledger = new LedgerZBariera(p);
  const audit = new AuditService(p);
  const mailer = { send: vi.fn(async () => undefined) };
  const vat = { ustal: async () => ({ traktowanie: traktowanieZKodu('PL', 23, 'PL')!, vies: null }) };
  const doladowanie = new DoladowanieService(p, ledger, vat as never);
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = {
    isAsync: () => true,
    enqueueWalletProvision: async (o: { subscriptionId: string }) => {
      if (kolejkaPada) throw new Error('kolejka niedostępna');
      kolejka.push(o.subscriptionId);
    },
  };
  const subscriptions = new SubscriptionsService(
    p, audit, ledger, null as never, { sprawdzDomeneGlowna: async () => undefined, sprawdzMiejsce: async () => undefined } as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, { safeAward: () => undefined } as never,
    { getTrialOffer: async () => oferta } as never, null as never,
  );
  const cfg: Record<string, string> = {
    paynowApiKey: 'api-key-przeglad', paynowSignatureKey: SIG, paynowApiUrl: 'https://api.sandbox.paynow.pl', clientPanelUrl: 'https://panel.test',
  };
  const billing = new BillingService(
    p, ledger, null as never, audit, { get: (k: string) => cfg[k] } as never, null as never, subscriptions, { send: vi.fn(async () => undefined) } as never, pusty,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
    doladowanie,
  );
  return { billing, subscriptions };
}

const fetchMock = vi.fn();
let nr = 0;
const nowyPid = () => {
  nr += 1;
  return `PRZG-${String(nr).padStart(3, '0')}-AAA-BBB`;
};
async function zamowPaynow(s: ReturnType<typeof serwisy>, userId: string, planId: string, domena: string) {
  const pid = nowyPid();
  const { subscription, doZaplatyPaynow } = await s.subscriptions.create(userId, {
    planId, interval: 'MONTH', paymentSource: 'WALLET', oplata: 'PAYNOW', domain: domena, immediatePerformanceConsent: true,
  } as never);
  fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ redirectUrl: 'https://paywall/x', paymentId: pid, status: 'NEW' }) });
  await s.billing.zaplacZamowieniePaynow(userId, { subscriptionId: subscription.id, kwotaK: doZaplatyPaynow!.kwotaK, domena });
  const rek = await prisma().paynowPlatnosc.findFirstOrThrow({ where: { paymentId: pid } });
  return { subscription, rek, pid };
}
function powiadomienie(s: ReturnType<typeof serwisy>, rekId: string, pid: string, status: string) {
  const raw = Buffer.from(JSON.stringify({ paymentId: pid, externalId: rekId, status }));
  return s.billing.handlePaynowNotification(raw, podpisPowiadomienia(SIG, raw));
}

describe('przegląd 15.10 — zakup Paynow i rabat na start', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    kolejka.length = 0;
    kolejkaPada = false;
    bariera = null;
    oferta = { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(rozlacz);

  it('[1] rabat na start: dwa zamówienia Paynow złożone przed zapłatą pierwszego — rabat tylko raz', async () => {
    oferta = { cardEnabled: true, monthlyDiscountPct: 20, annualDiscountPct: 0, introDiscountPeriods: 12 };
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-1-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    const a = await zamowPaynow(s, u.id, plan.id, 'sklep-a.pl');
    const b = await zamowPaynow(s, u.id, plan.id, 'sklep-b.pl');
    await powiadomienie(s, a.rek.id, a.pid, 'CONFIRMED');
    await powiadomienie(s, b.rek.id, b.pid, 'CONFIRMED');
    const subs = await prisma().subscription.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(subs.map((x) => x.status)).toEqual([SubscriptionStatus.PROVISIONING, SubscriptionStatus.PROVISIONING]);
    // Oczekiwane: druga usługa po cenie z cennika, bez rabatu na kolejne okresy.
    expect(subs.map((x) => [Number(x.priceAmount), x.introDiscountPct, x.introDiscountPeriodsLeft])).toEqual([
      [36, 20, 11],
      [45, 0, 0],
    ]);
  });

  it('[2] rabat na start: nieudane zakładanie (zwrot) zużywa rabat — klient zamawia ponownie bez rabatu', async () => {
    oferta = { cardEnabled: true, monthlyDiscountPct: 20, annualDiscountPct: 0, introDiscountPeriods: 12 };
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-2-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 100 } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    kolejkaPada = true;
    await expect(s.subscriptions.create(u.id, {
      planId: plan.id, interval: 'MONTH', paymentSource: 'WALLET', domain: 'sklep-c.pl', immediatePerformanceConsent: true,
    } as never)).rejects.toThrow('kolejka');
    // Pieniądze wróciły, usługi nie ma.
    expect(Number((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).walletBalance)).toBe(100);
    const sub = await prisma().subscription.findFirstOrThrow({ where: { userId: u.id } });
    expect(sub.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
    // Oczekiwane: klient nie kupił jeszcze niczego — rabat na start nadal przysługuje.
    expect(await s.subscriptions.rabatStartowy(u.id)).toEqual({ przysluguje: true });
  });

  it('[3] dwie potwierdzone wpłaty Paynow za to samo zamówienie naraz — usługa nie może wyjść za darmo', async () => {
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-3-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    const a = await zamowPaynow(s, u.id, plan.id, 'sklep-d.pl');
    // Pierwsza płatność kończy się błędem → klient płaci ponownie (zaplac-paynow) → druga płatność.
    await powiadomienie(s, a.rek.id, a.pid, 'ERROR');
    const pid2 = nowyPid();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ redirectUrl: 'https://paywall/y', paymentId: pid2, status: 'NEW' }) });
    await s.billing.zaplacUslugePaynow(u.id, a.subscription.id);
    const rek2 = await prisma().paynowPlatnosc.findFirstOrThrow({ where: { paymentId: pid2 } });
    // Obie płatności potwierdzone w tej samej chwili (spóźnione CONFIRMED pierwszej + druga).
    let zwolnij!: () => void;
    let pierwszyKoniec!: () => void;
    bariera = {
      czekaj: 2,
      p: new Promise<void>((r) => (zwolnij = r)),
      pierwszyGotowy: new Promise<void>((r) => (pierwszyKoniec = r)),
    };
    bariera.zwolnij = zwolnij;
    bariera.pierwszyKoniec = pierwszyKoniec;
    await Promise.all([powiadomienie(s, a.rek.id, a.pid, 'CONFIRMED'), powiadomienie(s, rek2.id, pid2, 'CONFIRMED')]);

    const sub = await prisma().subscription.findUniqueOrThrow({ where: { id: a.subscription.id } });
    expect(sub.status).toBe(SubscriptionStatus.PROVISIONING);
    const wpisy = await prisma().walletTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    const typy = wpisy.map((w) => `${w.type}:${Number(w.amount)}`);
    // Oczekiwane: 2 wpłaty po 45 K, jedno obciążenie 45 K, BEZ zwrotu (usługa w zakładaniu) → saldo 45.
    expect(typy.filter((t) => t.startsWith('REFUND'))).toEqual([]);
    expect(Number((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).walletBalance)).toBe(45);
  });

  it('[4] wpłata za zamówienie anulowane przed zaksięgowaniem: dokument/portfel jak doładowanie, bez purchase', async () => {
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-4-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    const a = await zamowPaynow(s, u.id, plan.id, 'sklep-e.pl');
    // Sprzątanie po 48 h (albo klient) anuluje zamówienie, przelew dochodzi później.
    await prisma().subscription.update({ where: { id: a.subscription.id }, data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() } });
    await powiadomienie(s, a.rek.id, a.pid, 'CONFIRMED');
    const [dok] = await prisma().invoice.findMany({ where: { userId: u.id } });
    const [poz] = dok.lineItems as Array<{ name: string }>;
    const [wplata] = await prisma().walletTransaction.findMany({ where: { userId: u.id, type: WalletTxType.TOPUP } });
    const wynik = await s.billing.sprawdzPlatnoscPaynow(u.id, a.rek.id);
    expect(poz.name).toMatch(/^Doładowanie konta/);
    // Oczekiwane spójnie z pozycją: dokument nie wskazuje usługi, portfel „Doładowanie”, brak purchase.
    expect({ sub: dok.subscriptionId, opis: wplata.description, zakup: wynik.zakup ?? null }).toEqual({
      sub: null,
      opis: `Doładowanie Paynow (${a.pid})`,
      zakup: null,
    });
  });
  it('[2b] zamówienie z pustego portfela (brak środków) nie trzyma rabatu: po doładowaniu nowe zamówienie z rabatem', async () => {
    oferta = { cardEnabled: true, monthlyDiscountPct: 20, annualDiscountPct: 0, introDiscountPeriods: 12 };
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-2b-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    const zamow = (domena: string) =>
      s.subscriptions.create(u.id, { planId: plan.id, interval: 'MONTH', paymentSource: 'WALLET', domain: domena, immediatePerformanceConsent: true } as never);
    await expect(zamow('sklep-h.pl')).rejects.toThrow();
    await prisma().user.update({ where: { id: u.id }, data: { walletBalance: 100 } });
    await zamow('sklep-h.pl');
    const subs = await prisma().subscription.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(subs.map((x) => [x.status, x.introDiscountPct])).toEqual([
      [SubscriptionStatus.PENDING_PAYMENT, 0],
      [SubscriptionStatus.PROVISIONING, 20],
    ]);
    expect(Number(subs[1].priceAmount)).toBe(36);
  });

  it('[4b] zwrot po nieudanym zakładaniu: wpłata nie jest raportowana jako zakup (GA4/Meta)', async () => {
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-4b-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    const a = await zamowPaynow(s, u.id, plan.id, 'sklep-f.pl');
    kolejkaPada = true;
    await powiadomienie(s, a.rek.id, a.pid, 'CONFIRMED');
    expect(await prisma().walletTransaction.findUnique({ where: { idempotencyKey: `sub-${a.subscription.id}-initial-refund` } })).not.toBeNull();
    expect((await s.billing.sprawdzPlatnoscPaynow(u.id, a.rek.id)).zakup ?? null).toBeNull();
  });

  it('[4c] opłacone i zakładane zamówienie dalej daje dane zakupu', async () => {
    const s = serwisy();
    const u = await prisma().user.create({ data: { email: `przg-4c-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan({ priceMonthly: 45 });
    const a = await zamowPaynow(s, u.id, plan.id, 'sklep-g.pl');
    await powiadomienie(s, a.rek.id, a.pid, 'CONFIRMED');
    expect((await s.billing.sprawdzPlatnoscPaynow(u.id, a.rek.id)).zakup).toMatchObject({ transactionId: a.subscription.id, wartosc: 45 });
  });
});
