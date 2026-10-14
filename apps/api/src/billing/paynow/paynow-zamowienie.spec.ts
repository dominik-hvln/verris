import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { BillingService } from '../billing.service.js';
import { podpisPowiadomienia } from './paynow.client.js';

/**
 * 2026-10-12 (Dominik): klient klika „Zapłać” z zamiarem kupienia usługi, nie doładowania konta — płatność Paynow
 * za konkretną usługę niesie dane zamówienia, a dokument za wpłatę nazywa usługę i okres. Po wpłacie zamówienie
 * realizuje się z portfela (nowa usługa: provisioning; zaległe odnowienie: to samo co „Opłać z portfela”).
 */
const API_KEY = 'api-key-test';
const SIG_KEY = 'sig-key-test';
const PID = 'ZAMW-001-002-003';

type Rek = { id: string; userId: string; kwotaMinor: number; waluta: string; paymentId: string | null; status: string; meta: Record<string, string>; walletTxId: string | null };
type Sub = {
  id: string;
  userId: string;
  status: string;
  interval: 'MONTH' | 'YEAR';
  currency: string;
  paymentSource: string;
  currentPeriodEnd: Date | null;
  priceAmount: Prisma.Decimal;
  listPriceAmount: Prisma.Decimal | null;
  appliedPromoCodeId: string | null;
  introDiscountPct: number;
  introDiscountPeriodsLeft: number;
  individualPrice: Prisma.Decimal | null;
  plan: { name: string };
  account: { domain: string } | null;
  events: Array<{ details: unknown }>;
};

function zbuduj(o: { sub?: Partial<Sub>; cenaNetto?: boolean; paynow?: boolean } = {}) {
  const rekordy = new Map<string, Rek>();
  const pasuje = (r: Rek, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'not' in (v as object) ? r[k as keyof Rek] !== (v as { not: unknown }).not : r[k as keyof Rek] === v,
    );
  const sub: Sub = {
    id: 'sub-1',
    userId: 'u1',
    status: 'PENDING_PAYMENT',
    interval: 'YEAR',
    currency: 'PLN',
    paymentSource: 'WALLET',
    currentPeriodEnd: null,
    priceAmount: new Prisma.Decimal('468.00'),
    listPriceAmount: null,
    appliedPromoCodeId: null,
    introDiscountPct: 0,
    introDiscountPeriodsLeft: 0,
    individualPrice: null,
    plan: { name: 'Hosting Start' },
    account: null,
    events: [],
    ...o.sub,
  };
  const paynowPlatnosc = {
    create: vi.fn(async ({ data }: { data: Partial<Rek> }) => {
      const r = { id: `rek-${rekordy.size + 1}`, paymentId: null, status: 'NEW', waluta: 'PLN', walletTxId: null, ...data } as Rek;
      rekordy.set(r.id, r);
      return { ...r };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Rek> }) => Object.assign(rekordy.get(where.id)!, data)),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Rek> }) => {
      let count = 0;
      for (const r of rekordy.values()) if (pasuje(r, where)) { Object.assign(r, data); count++; }
      return { count };
    }),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const r = [...rekordy.values()].find((x) => pasuje(x, where));
      return r ? { ...r } : null;
    }),
    // Ponowienie zamówienia: ostatnia płatność „nowa” za tę usługę (filtr JSON w Prismie — tu po metadanych).
    findFirst: vi.fn(async () => {
      const r = [...rekordy.values()].filter((x) => x.meta.kind === 'zamowienie' && x.meta.zamowienieTyp === 'nowa').pop();
      return r ? { ...r } : null;
    }),
  };
  const zuzyteKlucze = new Set<string>();
  const ledger = { findByIdempotencyKey: vi.fn(async (k: string) => (zuzyteKlucze.has(k) ? { id: 'stary' } : null)) };
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'klient@test.pl', walletCurrency: 'PLN', walletBalance: new Prisma.Decimal(0), firstName: 'Jan', anonymizedAt: null }),
      findMany: vi.fn().mockResolvedValue([{ id: 'admin1' }]),
    },
    subscription: { findFirst: vi.fn(async () => ({ ...sub })) },
    notification: { createMany: vi.fn() },
    paynowPlatnosc,
  };
  const ksiegi = new Set<string>();
  const doladowanie = {
    ustalTraktowanie: vi.fn().mockResolvedValue({
      traktowanie: o.cenaNetto
        ? { kod: 'OO', stawka: null, kraj: 'DE', cenaNetto: true }
        : { kod: 'PL', stawka: 23, kraj: 'PL', cenaNetto: false },
      vies: null,
    }),
    zaksieguj: vi.fn(async (i: { idempotencyKey: string; kwotaMinor: number }) => {
      const nowy = !ksiegi.has(i.idempotencyKey);
      ksiegi.add(i.idempotencyKey);
      return { wpis: { id: 'wtx-1', idempotencyKey: i.idempotencyKey }, kredytK: new Prisma.Decimal(i.kwotaMinor).dividedBy(100), nowy };
    }),
  };
  const subscriptions = { oplacZamowienieZPortfela: vi.fn().mockResolvedValue({ subscription: { id: 'sub-1' } }) };
  const renewal = { retryPastDueNow: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) };
  const audit = { record: vi.fn() };
  const promo = { resolveNextRenewalAmount: vi.fn().mockResolvedValue(new Prisma.Decimal('39.00')), applyPercentBonusForTopup: vi.fn() };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const eco = { safeAward: vi.fn(), awardWalletTopup: vi.fn() };
  const cfg: Record<string, string> = {
    clientPanelUrl: 'https://panel.verris.pl',
    ...(o.paynow === false ? {} : { paynowApiKey: API_KEY, paynowSignatureKey: SIG_KEY, paynowApiUrl: 'https://api.sandbox.paynow.pl' }),
  };
  const svc = new BillingService(
    prisma as never, ledger as never, {} as never, audit as never, { get: (k: string) => cfg[k] } as never,
    {} as never, subscriptions as never, mailer as never, promo as never, eco as never, doladowanie as never,
    renewal as never,
  );
  return { svc, sub, rekordy, prisma, doladowanie, subscriptions, renewal, audit, mailer, zuzyteKlucze, paynowPlatnosc };
}

const fetchMock = vi.fn();
const odp = (status: number, dane: unknown) => ({ ok: status < 300, status, json: async () => dane });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const utworzonaPaynow = () => fetchMock.mockResolvedValueOnce(odp(201, { redirectUrl: 'https://paywall.sandbox.paynow.pl/z', paymentId: PID, status: 'NEW' }));

async function potwierdz(s: ReturnType<typeof zbuduj>, rekId: string) {
  const raw = Buffer.from(JSON.stringify({ paymentId: PID, externalId: rekId, status: 'CONFIRMED' }));
  await s.svc.handlePaynowNotification(raw, podpisPowiadomienia(SIG_KEY, raw));
  await new Promise((r) => setTimeout(r, 0));
}

describe('Paynow — zakup nowej usługi', () => {
  it('płatność na pełną cenę usługi, z danymi zamówienia w metadanych i powrotem „zamówienie”', async () => {
    const s = zbuduj();
    utworzonaPaynow();
    const { url } = await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('468.00'), domena: 'przyklad.pl', region: 'PL-WAW' });
    expect(url).toBe('https://paywall.sandbox.paynow.pl/z');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const rek = [...s.rekordy.values()][0];
    expect(body).toMatchObject({
      amount: 46800,
      currency: 'PLN',
      description: 'Hosting Start — 12 mies. (przyklad.pl) — Verris',
      continueUrl: `https://panel.verris.pl/dashboard/billing?paynow=${rek.id}&zamowienie=1`,
    });
    expect(rek.meta).toMatchObject({ kind: 'zamowienie', zamowienieTyp: 'nowa', subscriptionId: 'sub-1', domena: 'przyklad.pl', region: 'PL-WAW', vatKod: 'PL' });
  });

  it('klient rozliczany netto płaci cenę / 1,23 zaokrągloną w górę — wpłata pokrywa usługę', async () => {
    const s = zbuduj({ cenaNetto: true });
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('40.30'), domena: 'a.de' });
    // 40,30 / 1,23 = 32,764… → 32,77 zł (32,77 × 1,23 = 40,31 K ≥ 40,30 K).
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).amount).toBe(3277);
  });

  it('usługa, która nie czeka na płatność → 409; bez Paynow → 400 (bez wywołania operatora)', async () => {
    await expect(
      zbuduj({ sub: { status: 'ACTIVE' } }).svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal(10) }),
    ).rejects.toThrow(ConflictException);
    await expect(
      zbuduj({ paynow: false }).svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal(10) }),
    ).rejects.toThrow(BadRequestException);
    expect(() => zbuduj({ paynow: false }).svc.sprawdzPaynowZamowienia()).toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('po wpłacie: dokument nazywa usługę i okres, zamówienie realizuje się z portfela raz, bez maila „doładowano portfel”', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
    const s = zbuduj();
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('468.00'), domena: 'przyklad.pl' });
    const rek = [...s.rekordy.values()][0];
    await potwierdz(s, rek.id);
    await potwierdz(s, rek.id); // duplikat powiadomienia
    expect(s.doladowanie.zaksieguj).toHaveBeenCalledWith(
      expect.objectContaining({ kwotaMinor: 46800, nazwaPozycji: 'Hosting Start — 12 mies. (przyklad.pl), okres 13.10.2026–13.10.2027' }),
    );
    expect(s.subscriptions.oplacZamowienieZPortfela).toHaveBeenCalledTimes(1);
    expect(s.subscriptions.oplacZamowienieZPortfela).toHaveBeenCalledWith('u1', 'sub-1', { domain: 'przyklad.pl', preferredRegion: null });
    expect(s.mailer.send).not.toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ZAMOWIENIE_PAYNOW_ZREALIZOWANE' }));
  });

  it('usługa anulowana przed wpłatą: dokument zostaje doładowaniem, realizacja odmawia → alarm dla adminów, K w portfelu', async () => {
    const s = zbuduj();
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('468.00'), domena: 'przyklad.pl' });
    s.sub.status = 'CANCELED';
    s.prisma.subscription.findFirst.mockResolvedValue({ ...s.sub });
    s.subscriptions.oplacZamowienieZPortfela.mockRejectedValueOnce(new ConflictException('Usługa nie czeka na płatność z portfela (stan: CANCELED).'));
    await potwierdz(s, [...s.rekordy.values()][0].id);
    expect(s.doladowanie.zaksieguj).toHaveBeenCalledWith(expect.objectContaining({ nazwaPozycji: null }));
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ZAMOWIENIE_PAYNOW_NIEZREALIZOWANE' }));
    expect(s.prisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'admin1', title: 'Opłacone zamówienie nie zostało zrealizowane' })],
    });
    expect([...s.rekordy.values()][0].status).toBe('CONFIRMED');
  });
});

describe('Paynow — zaległe odnowienie', () => {
  const zalegla = { status: 'PAST_DUE', interval: 'MONTH' as const, currentPeriodEnd: new Date('2026-10-10T09:00:00Z'), account: { domain: 'sklep.pl' } };

  it('kwota odnowienia z cennika usługi; po wpłacie dokument „odnowienie” od końca opłaconego okresu i odnowienie z portfela', async () => {
    const s = zbuduj({ sub: zalegla });
    utworzonaPaynow();
    await s.svc.zaplacUslugePaynow('u1', 'sub-1');
    const rek = [...s.rekordy.values()][0];
    expect(rek.kwotaMinor).toBe(3900);
    expect(rek.meta).toMatchObject({ kind: 'zamowienie', zamowienieTyp: 'odnowienie', subscriptionId: 'sub-1' });
    await potwierdz(s, rek.id);
    expect(s.doladowanie.zaksieguj).toHaveBeenCalledWith(
      expect.objectContaining({ nazwaPozycji: 'Hosting Start — odnowienie miesięczne (sklep.pl), okres 10.10.2026–10.11.2026' }),
    );
    expect(s.renewal.retryPastDueNow).toHaveBeenCalledWith('u1', 'sub-1');
    expect(s.subscriptions.oplacZamowienieZPortfela).not.toHaveBeenCalled();
  });

  // Przegląd 13.10: zawieszenie wybrane przez obsługę (także „brak płatności”) nie schodzi po wpłacie — odmowa
  // PRZED pobraniem pieniędzy; okres już opłacony (odwieszenie nie wyszło) — bez drugiej opłaty.
  it('zawieszenie przez obsługę albo okres już opłacony → 409 bez płatności; zawieszenie po karencji → płatność', async () => {
    const reczne = zbuduj({ sub: { ...zalegla, status: 'SUSPENDED', events: [{ details: { reason: 'PAYMENT_FAILED' } }] } });
    await expect(reczne.svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow('zawiesiła obsługa');
    const oplacona = zbuduj({
      sub: { ...zalegla, status: 'SUSPENDED', events: [{ details: { reason: 'GRACE_EXPIRED' } }], currentPeriodEnd: new Date('2026-11-10T09:00:00Z') },
    });
    await expect(oplacona.svc.zaplacUslugePaynow('u1', 'sub-1', new Date('2026-10-13T08:00:00Z'))).rejects.toThrow('już opłacony');
    expect(fetchMock).not.toHaveBeenCalled();
    const karencja = zbuduj({ sub: { ...zalegla, status: 'SUSPENDED', events: [{ details: { reason: 'GRACE_EXPIRED' } }] } });
    utworzonaPaynow();
    await karencja.svc.zaplacUslugePaynow('u1', 'sub-1', new Date('2026-10-13T08:00:00Z'));
    expect([...karencja.rekordy.values()][0].meta).toMatchObject({ zamowienieTyp: 'odnowienie' });
  });

  it('usługa bez zaległości albo na karcie → 409', async () => {
    await expect(zbuduj({ sub: { status: 'ACTIVE' } }).svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow(ConflictException);
    await expect(zbuduj({ sub: { ...zalegla, paymentSource: 'STRIPE_CARD' } }).svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow(ConflictException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Paynow — ponowienie płatności za zamówienie (BLIK odrzucony, okno zamknięte)', () => {
  it('poprzednia płatność nieudana → nowa płatność za tę samą usługę z tą samą domeną', async () => {
    const s = zbuduj();
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('468.00'), domena: 'przyklad.pl', region: 'PL-WAW' });
    [...s.rekordy.values()][0].status = 'REJECTED';
    utworzonaPaynow();
    await s.svc.zaplacUslugePaynow('u1', 'sub-1');
    const [, druga] = [...s.rekordy.values()];
    expect(druga).toMatchObject({ kwotaMinor: 46800, meta: expect.objectContaining({ zamowienieTyp: 'nowa', domena: 'przyklad.pl', region: 'PL-WAW' }) });
  });

  it('poprzednia płatność trwa albo doszła, brak płatności Paynow, zamówienie już obciążane → 409 bez nowej płatności', async () => {
    const s = zbuduj();
    await expect(s.svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow('opłacisz z portfela');
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('468.00'), domena: 'a.pl' });
    await expect(s.svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow('jeszcze trwa');
    [...s.rekordy.values()][0].status = 'CONFIRMED';
    await expect(s.svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow('już do nas dotarła');
    [...s.rekordy.values()][0].status = 'REJECTED';
    s.zuzyteKlucze.add('sub-sub-1-initial');
    await expect(s.svc.zaplacUslugePaynow('u1', 'sub-1')).rejects.toThrow('zamów usługę ponownie');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Paynow — zamówienie a skutki uboczne wpłaty', () => {
  it('błąd skutków ubocznych (dziennik) nie zatrzymuje realizacji opłaconego zamówienia', async () => {
    const s = zbuduj();
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('468.00'), domena: 'przyklad.pl' });
    s.audit.record.mockImplementation(async (a: { action: string }) => {
      if (a.action === 'WALLET_TOPUP_COMPLETED') throw new Error('baza chwilowo niedostępna');
    });
    await potwierdz(s, [...s.rekordy.values()][0].id);
    expect(s.subscriptions.oplacZamowienieZPortfela).toHaveBeenCalledTimes(1);
  });
});

/**
 * PB-08 (e2e 14.10): zakup usługi Paynow nie trafiał do GA4 — po powrocie z Paynow strona nie miała danych zakupu.
 * Sprawdzenie statusu po powrocie zwraca je tylko dla opłaconej NOWEJ usługi.
 */
describe('Paynow — dane zakupu po powrocie (PB-08)', () => {
  const poId = (s: ReturnType<typeof zbuduj>) =>
    s.paynowPlatnosc.findFirst.mockImplementation((async ({ where }: { where: { id: string; userId: string } }) => {
      const r = s.rekordy.get(where.id);
      return r && r.userId === where.userId ? { ...r } : null;
    }) as never);

  it('opłacona nowa usługa → zakup z id usługi, kwotą wpłaty i nazwą planu', async () => {
    const s = zbuduj();
    poId(s);
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('381.65'), domena: 'sl.hvln.pl' });
    const rek = [...s.rekordy.values()][0];
    await potwierdz(s, rek.id);
    await expect(s.svc.sprawdzPlatnoscPaynow('u1', rek.id)).resolves.toEqual({
      status: 'CONFIRMED',
      zakup: { transactionId: 'sub-1', wartosc: 381.65, waluta: 'PLN', nazwa: 'Hosting Start', kategoria: 'hosting' },
    });
  });

  it('jeszcze nieopłacona → bez zakupu; zaległe odnowienie po wpłacie → bez zakupu', async () => {
    const s = zbuduj();
    poId(s);
    utworzonaPaynow();
    await s.svc.zaplacZamowieniePaynow('u1', { subscriptionId: 'sub-1', kwotaK: new Prisma.Decimal('45.00') });
    const rek = [...s.rekordy.values()][0];
    fetchMock.mockResolvedValueOnce(odp(200, { paymentId: PID, status: 'PENDING' }));
    await expect(s.svc.sprawdzPlatnoscPaynow('u1', rek.id)).resolves.toEqual({ status: 'PENDING' });

    const z = zbuduj({ sub: { status: 'PAST_DUE', interval: 'MONTH', currentPeriodEnd: new Date('2026-10-10T09:00:00Z') } });
    poId(z);
    utworzonaPaynow();
    await z.svc.zaplacUslugePaynow('u1', 'sub-1');
    const odn = [...z.rekordy.values()][0];
    await potwierdz(z, odn.id);
    await expect(z.svc.sprawdzPlatnoscPaynow('u1', odn.id)).resolves.toEqual({ status: 'CONFIRMED' });
  });
});
