import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { BillingService } from '../billing.service.js';
import { podpisPowiadomienia, podpisZadania } from './paynow.client.js';

/**
 * 2026-10-05 — doładowanie portfela przez Paynow (mBank): utworzenie płatności, powiadomienie,
 * zapasowe sprawdzenie statusu i zwrot. Pieniądze: K wchodzą dokładnie raz, zły podpis / obca
 * płatność nie księgują nic, bez PAYNOW_* ścieżka zostaje stripe'owa.
 */
const API_KEY = 'api-key-test';
const SIG_KEY = 'sig-key-test';
const PID = 'NOLV-8F9-08K-WGD';

type Rek = {
  id: string;
  userId: string;
  kwotaMinor: number;
  waluta: string;
  paymentId: string | null;
  status: string;
  meta: Record<string, string>;
  walletTxId: string | null;
  zwroconoMinor: number;
  zwrotyIds: string[];
};

function zbuduj(opcje: { paynow?: boolean } = {}) {
  const rekordy = new Map<string, Rek>();
  let licznik = 0;
  const pasuje = (r: Rek, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'not' in (v as object) ? r[k as keyof Rek] !== (v as { not: unknown }).not : r[k as keyof Rek] === v,
    );
  const paynowPlatnosc = {
    create: vi.fn(async ({ data }: { data: Partial<Rek> }) => {
      const r = Object.assign({ id: `0000000${++licznik}-aaaa-4bbb-8ccc-dddddddddddd`, paymentId: null, status: 'NEW', waluta: 'PLN', walletTxId: null, zwroconoMinor: 0, zwrotyIds: [] }, data) as Rek;
      rekordy.set(r.id, r);
      return { ...r };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Rek> & { zwrotyIds?: unknown } }) => {
      const r = rekordy.get(where.id)!;
      const { zwrotyIds, ...reszta } = data;
      Object.assign(r, reszta);
      if (zwrotyIds && typeof zwrotyIds === 'object' && 'push' in zwrotyIds) r.zwrotyIds.push((zwrotyIds as unknown as { push: string }).push);
      return { ...r };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Rek> }) => {
      let count = 0;
      for (const r of rekordy.values()) if (pasuje(r, where)) { Object.assign(r, data); count++; }
      return { count };
    }),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const r = [...rekordy.values()].find((x) => pasuje(x, where));
      return r ? { ...r } : null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const r = [...rekordy.values()].find((x) => pasuje(x, where));
      return r ? { ...r } : null;
    }),
  };
  const wplata = { id: 'wtx-1', userId: 'u1', amount: new Prisma.Decimal('50.00'), metadata: { wplata: { kwota: '50.00' } } };
  const tx = {
    $queryRaw: vi.fn(),
    walletTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    paynowPlatnosc,
  };
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'klient@test.pl', walletCurrency: 'PLN', walletBalance: new Prisma.Decimal(0) }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ email: 'klient@test.pl' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'admin1' }]),
    },
    notification: { createMany: vi.fn() },
    walletTransaction: { findUniqueOrThrow: vi.fn().mockResolvedValue(wplata) },
    paynowPlatnosc,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const ksiegi = new Set<string>();
  const doladowanie = {
    ustalTraktowanie: vi.fn().mockResolvedValue({ traktowanie: { kod: 'PL', stawka: 23, kraj: 'PL' }, vies: null }),
    zaksieguj: vi.fn(async (i: { idempotencyKey: string; kwotaMinor: number }) => {
      const nowy = !ksiegi.has(i.idempotencyKey);
      ksiegi.add(i.idempotencyKey);
      return { wpis: { id: 'wtx-1', idempotencyKey: i.idempotencyKey }, kredytK: new Prisma.Decimal(i.kwotaMinor).dividedBy(100), nowy };
    }),
  };
  const ledger = { zapiszWpis: vi.fn().mockResolvedValue({ id: 'wtx-zwrot' }) };
  const stripe = { createCheckoutSession: vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe' }) };
  const audit = { record: vi.fn() };
  const promo = {
    previewPercentBonus: vi.fn().mockResolvedValue({ promoCodeId: 'p1', code: 'BONUS10', bonusAmount: new Prisma.Decimal(5), percent: 10 }),
    applyPercentBonusForTopup: vi.fn().mockResolvedValue({ walletTxId: 'b1' }),
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const eco = { safeAward: vi.fn(), awardWalletTopup: vi.fn() };
  const cfg: Record<string, string> = {
    clientPanelUrl: 'https://panel.verris.pl',
    stripeSuccessUrl: 'https://panel/ok',
    stripeCancelUrl: 'https://panel/anuluj',
    ...(opcje.paynow === false ? {} : { paynowApiKey: API_KEY, paynowSignatureKey: SIG_KEY, paynowApiUrl: 'https://api.sandbox.paynow.pl' }),
  };
  const config = { get: (k: string) => cfg[k] };
  const svc = new BillingService(
    prisma as never, ledger as never, stripe as never, audit as never, config as never,
    {} as never, {} as never, mailer as never, promo as never, eco as never, doladowanie as never,
  );
  return { svc, rekordy, prisma, tx, doladowanie, ledger, stripe, audit, promo, eco };
}

const fetchMock = vi.fn();
const odp = (status: number, dane: unknown) => ({ ok: status < 300, status, json: async () => dane });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function powiadomienie(dane: Record<string, string>, klucz = SIG_KEY) {
  const raw = Buffer.from(JSON.stringify(dane));
  return { raw, podpis: podpisPowiadomienia(klucz, raw) };
}

async function utworzona(s: ReturnType<typeof zbuduj>, kod?: string) {
  fetchMock.mockResolvedValueOnce(odp(201, { redirectUrl: 'https://paywall.sandbox.paynow.pl/x', paymentId: PID, status: 'NEW' }));
  const wynik = await s.svc.createTopupCheckoutSession({ userId: 'u1', amount: 45.67, promoCode: kod });
  return { wynik, rek: s.rekordy.get(wynik.sessionId)! };
}

describe('Paynow — utworzenie doładowania', () => {
  it('PLN bez wyboru → Paynow: kwota w groszach, externalId i Idempotency-Key = rekord, continueUrl na stronę płatności', async () => {
    const s = zbuduj();
    const { wynik, rek } = await utworzona(s, 'BONUS10');
    expect(wynik.url).toBe('https://paywall.sandbox.paynow.pl/x');
    expect(wynik.bonus).toEqual({ amount: '5.00', percent: 10, code: 'BONUS10' });
    expect(s.stripe.createCheckoutSession).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sandbox.paynow.pl/v3/payments');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      amount: 4567,
      currency: 'PLN',
      externalId: rek.id,
      continueUrl: `https://panel.verris.pl/dashboard/billing?paynow=${rek.id}`,
      buyer: { email: 'klient@test.pl' },
    });
    expect(init.headers['Idempotency-Key']).toBe(rek.id);
    expect(init.headers.Signature).toBe(podpisZadania({ apiKey: API_KEY, signatureKey: SIG_KEY, idempotencyKey: rek.id, body: init.body }));
    expect(rek).toMatchObject({ kwotaMinor: 4567, paymentId: PID, status: 'NEW' });
    // Kod i stawka VAT zapisane przy tworzeniu — tak jak metadane sesji Stripe.
    expect(rek.meta).toMatchObject({ kind: 'wallet_topup', promoCodeId: 'p1', promoPercent: '10', vatKod: 'PL' });
  });

  it('bez PAYNOW_* doładowanie idzie przez Stripe Checkout jak dotąd (żadnego wywołania Paynow)', async () => {
    const s = zbuduj({ paynow: false });
    const wynik = await s.svc.createTopupCheckoutSession({ userId: 'u1', amount: 50 });
    expect(wynik.url).toBe('https://checkout.stripe');
    expect(s.stripe.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 5000, currency: 'PLN' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.prisma.paynowPlatnosc.create).not.toHaveBeenCalled();
  });

  it('wybór „stripe” albo waluta EUR → Stripe; „paynow” dla EUR albo bez konfiguracji → błąd', async () => {
    const s = zbuduj();
    await s.svc.createTopupCheckoutSession({ userId: 'u1', amount: 50, metoda: 'stripe' });
    await s.svc.createTopupCheckoutSession({ userId: 'u1', amount: 50, currency: 'EUR' });
    expect(s.stripe.createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(s.svc.createTopupCheckoutSession({ userId: 'u1', amount: 50, currency: 'EUR', metoda: 'paynow' })).rejects.toThrow(BadRequestException);
    await expect(zbuduj({ paynow: false }).svc.createTopupCheckoutSession({ userId: 'u1', amount: 50, metoda: 'paynow' })).rejects.toThrow(BadRequestException);
  });

  it('Paynow odrzuca zlecenie → błąd dla klienta, rekord ERROR', async () => {
    const s = zbuduj();
    fetchMock.mockResolvedValueOnce(odp(400, { statusCode: 400, errors: [{ errorType: 'VALIDATION_ERROR' }] }));
    await expect(s.svc.createTopupCheckoutSession({ userId: 'u1', amount: 50 })).rejects.toThrow(BadRequestException);
    expect([...s.rekordy.values()][0].status).toBe('ERROR');
  });
});

describe('Paynow — powiadomienie', () => {
  it('zły podpis → 401 i żadnego księgowania', async () => {
    const s = zbuduj();
    const { rek } = await utworzona(s);
    const { raw } = powiadomienie({ paymentId: PID, externalId: rek.id, status: 'CONFIRMED' });
    await expect(s.svc.handlePaynowNotification(raw, podpisPowiadomienia('cudzy-klucz', raw))).rejects.toThrow(UnauthorizedException);
    await expect(s.svc.handlePaynowNotification(raw, undefined)).rejects.toThrow(UnauthorizedException);
    expect(s.doladowanie.zaksieguj).not.toHaveBeenCalled();
    expect(s.rekordy.get(rek.id)!.status).toBe('NEW');
  });

  it('CONFIRMED księguje raz: duplikat i spóźnione PENDING nic nie zmieniają, bonus/e-mail/EKO raz', async () => {
    const s = zbuduj();
    const { rek } = await utworzona(s, 'BONUS10');
    const pending = powiadomienie({ paymentId: PID, externalId: rek.id, status: 'PENDING', modifiedAt: '2026-10-05T10:00:00' });
    const ok = powiadomienie({ paymentId: PID, externalId: rek.id, status: 'CONFIRMED', modifiedAt: '2026-10-05T10:01:00' });
    await s.svc.handlePaynowNotification(pending.raw, pending.podpis);
    expect(s.rekordy.get(rek.id)!.status).toBe('PENDING');
    await s.svc.handlePaynowNotification(ok.raw, ok.podpis);
    await s.svc.handlePaynowNotification(ok.raw, ok.podpis);
    await s.svc.handlePaynowNotification(pending.raw, pending.podpis); // nie po kolei
    expect(s.rekordy.get(rek.id)).toMatchObject({ status: 'CONFIRMED', walletTxId: 'wtx-1' });
    expect(s.doladowanie.zaksieguj).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `paynow:${PID}`, kwotaMinor: 4567, waluta: 'PLN', paymentProvider: 'PAYNOW', paymentRef: PID }),
    );
    expect(s.promo.applyPercentBonusForTopup).toHaveBeenCalledTimes(1);
    expect(s.eco.safeAward).toHaveBeenCalledTimes(1);
    expect(s.audit.record.mock.calls.filter(([a]) => a.action === 'WALLET_TOPUP_COMPLETED')).toHaveLength(1);
  });

  it('podpisane powiadomienie o innej płatności niż utworzona → bez księgowania, audyt i alert dla admina', async () => {
    const s = zbuduj();
    const { rek } = await utworzona(s);
    const n = powiadomienie({ paymentId: 'ABCD-123-456-789', externalId: rek.id, status: 'CONFIRMED' });
    await s.svc.handlePaynowNotification(n.raw, n.podpis);
    expect(s.doladowanie.zaksieguj).not.toHaveBeenCalled();
    expect(s.rekordy.get(rek.id)!.status).toBe('NEW');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYNOW_PLATNOSC_NIEZGODNA' }));
    expect(s.prisma.notification.createMany).toHaveBeenCalled();
  });

  it('nieznany externalId → przyjęte (200), nic nie księgujemy', async () => {
    const s = zbuduj();
    const n = powiadomienie({ paymentId: PID, externalId: 'nie-nasze', status: 'CONFIRMED' });
    await expect(s.svc.handlePaynowNotification(n.raw, n.podpis)).resolves.toBeUndefined();
    expect(s.doladowanie.zaksieguj).not.toHaveBeenCalled();
  });
});

describe('Paynow — sprawdzenie statusu po powrocie (zgubione powiadomienie)', () => {
  it('Paynow mówi CONFIRMED → księguje raz; drugie wejście już nie pyta Paynow; potem powiadomienie nie dubluje', async () => {
    const s = zbuduj();
    const { rek } = await utworzona(s);
    fetchMock.mockResolvedValueOnce(odp(200, { paymentId: PID, status: 'CONFIRMED' }));
    await expect(s.svc.sprawdzPlatnoscPaynow('u1', rek.id)).resolves.toEqual({ status: 'CONFIRMED' });
    expect(fetchMock.mock.calls[1][0]).toBe(`https://api.sandbox.paynow.pl/v3/payments/${PID}/status`);
    await expect(s.svc.sprawdzPlatnoscPaynow('u1', rek.id)).resolves.toEqual({ status: 'CONFIRMED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const n = powiadomienie({ paymentId: PID, externalId: rek.id, status: 'CONFIRMED' });
    await s.svc.handlePaynowNotification(n.raw, n.podpis);
    expect(new Set(s.doladowanie.zaksieguj.mock.calls.map(([i]) => i.idempotencyKey))).toEqual(new Set([`paynow:${PID}`]));
    expect(s.audit.record.mock.calls.filter(([a]) => a.action === 'WALLET_TOPUP_COMPLETED')).toHaveLength(1);
  });

  it('cudzy rekord → 404; błąd Paynow → bieżący status bez księgowania', async () => {
    const s = zbuduj();
    const { rek } = await utworzona(s);
    await expect(s.svc.sprawdzPlatnoscPaynow('ktos-inny', rek.id)).rejects.toThrow('Nie znaleziono');
    fetchMock.mockResolvedValueOnce(odp(503, { errors: [{ errorType: 'SYSTEM_TEMPORARILY_UNAVAILABLE' }] }));
    await expect(s.svc.sprawdzPlatnoscPaynow('u1', rek.id)).resolves.toEqual({ status: 'NEW' });
    expect(s.doladowanie.zaksieguj).not.toHaveBeenCalled();
  });
});

describe('Paynow — zwrot z panelu admina', () => {
  async function zaksiegowana(s: ReturnType<typeof zbuduj>) {
    const { rek } = await utworzona(s);
    const n = powiadomienie({ paymentId: PID, externalId: rek.id, status: 'CONFIRMED' });
    await s.svc.handlePaynowNotification(n.raw, n.podpis);
    return rek;
  }

  it('zleca zwrot w Paynow (Idempotency-Key, grosze) i cofa K z portfela proporcjonalnie, z kluczem refundId', async () => {
    const s = zbuduj();
    const rek = await zaksiegowana(s);
    // Wpłata 45,67 zł, saldo 100 K; zwrot 20 zł → udział 20/45.67 z 50 K wpisu (atrapa) = 21.90 K.
    s.prisma.walletTransaction.findUniqueOrThrow.mockResolvedValue({
      id: 'wtx-1', userId: 'u1', amount: new Prisma.Decimal('45.67'), metadata: { wplata: { kwota: '45.67' } },
    });
    s.tx.$queryRaw
      .mockResolvedValueOnce([{ zwroconoMinor: 0, zwrotyIds: [] }])
      .mockResolvedValueOnce([{ walletBalance: new Prisma.Decimal(100) }]);
    fetchMock.mockResolvedValueOnce(odp(201, { refundId: 'RE6-9YD-ULU-MRL', status: 'PENDING' }));
    const wynik = await s.svc.zwrocPlatnoscPaynow({ walletTxId: 'wtx-1', kwota: 20, actorUserId: 'admin1' });
    expect(wynik).toEqual({ refundId: 'RE6-9YD-ULU-MRL', status: 'PENDING', kwota: '20.00' });
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe(`https://api.sandbox.paynow.pl/v3/payments/${PID}/refunds`);
    expect(JSON.parse(init.body)).toEqual({ amount: 2000, reason: 'OTHER' });
    expect(init.headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{1,45}$/);
    expect(s.ledger.zapiszWpis).toHaveBeenCalledTimes(1);
    const [, wpis, kierunek, kwota] = s.ledger.zapiszWpis.mock.calls[0];
    expect(kierunek).toBe('debit');
    expect(kwota.toFixed(2)).toBe('20.00');
    expect(wpis).toMatchObject({ idempotencyKey: 'paynow:zwrot:RE6-9YD-ULU-MRL', metadata: expect.objectContaining({ zwrotZa: 'wtx-1' }) });
    expect(s.rekordy.get(rek.id)).toMatchObject({ zwroconoMinor: 2000, zwrotyIds: ['RE6-9YD-ULU-MRL'] });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'WALLET_TOPUP_REFUNDED' }));
  });

  it('ten sam refundId drugi raz (ponowienie) nie cofa K ponownie; kwota ponad wpłatę → błąd bez wywołania Paynow', async () => {
    const s = zbuduj();
    await zaksiegowana(s);
    s.tx.$queryRaw.mockResolvedValueOnce([{ zwroconoMinor: 2000, zwrotyIds: ['RE6-9YD-ULU-MRL'] }]);
    fetchMock.mockResolvedValueOnce(odp(201, { refundId: 'RE6-9YD-ULU-MRL', status: 'PENDING' }));
    await s.svc.zwrocPlatnoscPaynow({ walletTxId: 'wtx-1', kwota: 20, actorUserId: 'admin1' });
    expect(s.ledger.zapiszWpis).not.toHaveBeenCalled();
    const wywolan = fetchMock.mock.calls.length;
    await expect(s.svc.zwrocPlatnoscPaynow({ walletTxId: 'wtx-1', kwota: 45.68, actorUserId: 'admin1' })).rejects.toThrow(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(wywolan);
  });

  it('zwrot zrobiony w panelu Paynow (t1 05.10): bez wywołania API, K cofnięte raz także przy dwukliku', async () => {
    const s = zbuduj();
    const rek = await zaksiegowana(s);
    s.prisma.walletTransaction.findUniqueOrThrow.mockResolvedValue({
      id: 'wtx-1', userId: 'u1', amount: new Prisma.Decimal('45.67'), metadata: { wplata: { kwota: '45.67' } },
    });
    s.tx.$queryRaw
      .mockResolvedValueOnce([{ zwroconoMinor: 0, zwrotyIds: [] }])
      .mockResolvedValueOnce([{ walletBalance: new Prisma.Decimal(100) }]);
    const wywolan = fetchMock.mock.calls.length;
    const wynik = await s.svc.zwrocPlatnoscPaynow({ walletTxId: 'wtx-1', actorUserId: 'admin1', wPaneluPaynow: true });
    expect(fetchMock).toHaveBeenCalledTimes(wywolan);
    expect(wynik).toMatchObject({ status: 'WYKONANY_W_PANELU', kwota: '45.67' });
    expect(s.ledger.zapiszWpis).toHaveBeenCalledTimes(1);
    expect(s.ledger.zapiszWpis.mock.calls[0][1]).toMatchObject({ description: expect.stringMatching(/panelu Paynow/) });
    const id = s.rekordy.get(rek.id)!.zwrotyIds[0];
    expect(id).toMatch(/^panel-/);
    // dwuklik: rekord jeszcze sprzed pierwszego zapisu (ten sam stan) → ten sam klucz → bez drugiego cofnięcia
    s.prisma.paynowPlatnosc.findUnique.mockResolvedValueOnce({ ...s.rekordy.get(rek.id)!, zwroconoMinor: 0 });
    s.tx.$queryRaw.mockResolvedValueOnce([{ zwroconoMinor: 4567, zwrotyIds: [id] }]);
    await s.svc.zwrocPlatnoscPaynow({ walletTxId: 'wtx-1', actorUserId: 'admin1', wPaneluPaynow: true });
    expect(s.ledger.zapiszWpis).toHaveBeenCalledTimes(1);
  });

  it('wpis spoza Paynow → błąd', async () => {
    const s = zbuduj();
    await expect(s.svc.zwrocPlatnoscPaynow({ walletTxId: 'inny', actorUserId: 'admin1' })).rejects.toThrow(BadRequestException);
  });
});

describe('Dokument za doładowanie — sposób płatności', () => {
  it('wpłata przez Paynow → „Płatność online (Paynow)”, przez Stripe → jak dotąd', async () => {
    const { InvoicesService } = await import('../invoices.service.js');
    const findUnique = vi.fn();
    const inv = new InvoicesService({ walletTransaction: { findUnique } } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const etykieta = (i: object) => (inv as unknown as { paymentMethodLabel: (i: object) => Promise<string> }).paymentMethodLabel(i);
    findUnique.mockResolvedValueOnce({ paymentProvider: 'PAYNOW' });
    await expect(etykieta({ provider: 'WALLET_TOPUP', providerRef: 'wtx-1' })).resolves.toBe('Płatność online (Paynow)');
    findUnique.mockResolvedValueOnce({ paymentProvider: 'STRIPE' });
    await expect(etykieta({ provider: 'WALLET_TOPUP', providerRef: 'wtx-2' })).resolves.toBe('Karta płatnicza');
    await expect(etykieta({ provider: 'WALLET', providerRef: null })).resolves.toBe('Portfel Verris');
  });
});

describe('PLATNOSCI_CYKLICZNE — punkt przełączenia płatności cyklicznych', () => {
  const przed = process.env.PLATNOSCI_CYKLICZNE;
  afterEach(() => {
    if (przed === undefined) delete process.env.PLATNOSCI_CYKLICZNE;
    else process.env.PLATNOSCI_CYKLICZNE = przed;
  });
  it('domyślnie stripe; inna wartość (np. payu) zatrzymuje start zamiast cicho zostać przy Stripe', async () => {
    const { readPlatnosciCykliczne } = await import('../../config/configuration.js');
    delete process.env.PLATNOSCI_CYKLICZNE;
    expect(readPlatnosciCykliczne()).toBe('stripe');
    process.env.PLATNOSCI_CYKLICZNE = 'payu';
    expect(() => readPlatnosciCykliczne()).toThrow(/PLATNOSCI_CYKLICZNE=payu/);
  });
});
