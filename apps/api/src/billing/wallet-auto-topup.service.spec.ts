import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { WalletAutoTopupService } from './wallet-auto-topup.service';

/**
 * M-22 — auto-doładowanie portfela: kiedy obciążamy kartę (off-session), na ile i czego
 * nie wolno. Dotąd zero testów na ścieżce, która sama pobiera pieniądze z karty klienta.
 */
const D = (v: number) => new Prisma.Decimal(v);

function regula(over: Partial<Record<string, unknown>> = {}, user: Partial<Record<string, unknown>> = {}) {
  return {
    userId: 'u1',
    threshold: D(50),
    topupAmount: D(100),
    currency: 'PLN',
    paymentMethodId: null as string | null,
    ...over,
    user: {
      id: 'u1',
      email: 'k@example.pl',
      firstName: 'Ala',
      walletBalance: D(10),
      walletCurrency: 'PLN',
      stripeCustomerId: 'cus_1',
      defaultPaymentMethodId: 'pm_domyslna',
      ...user,
    },
  };
}

function zbuduj(reguly: unknown[], opts: { configured?: boolean; pi?: unknown; piThrows?: Error; pmRow?: unknown } = {}) {
  const prisma = {
    walletAutoTopup: {
      findMany: jest.fn(async () => reguly),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async (a: unknown) => a),
      findUnique: jest.fn(async () => null),
    },
    paymentMethod: { findFirst: jest.fn(async () => opts.pmRow ?? null) },
  };
  const stripe = {
    isConfigured: jest.fn(() => opts.configured ?? true),
    createOffSessionPaymentIntent: jest.fn(async () => {
      if (opts.piThrows) throw opts.piThrows;
      return opts.pi ?? { id: 'pi_1', status: 'succeeded' };
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const mailer = { send: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };
  const svc = new WalletAutoTopupService(prisma as never, stripe as never, audit as never, mailer as never, config as never);
  return { svc, prisma, stripe, audit, mailer };
}

describe('WalletAutoTopupService (M-22)', () => {
  it('bez skonfigurowanego Stripe nic nie czyta i nic nie pobiera', async () => {
    const t = zbuduj([regula()], { configured: false });
    await t.svc.runEligibleChecks();
    expect(t.prisma.walletAutoTopup.findMany).not.toHaveBeenCalled();
    expect(t.stripe.createOffSessionPaymentIntent).not.toHaveBeenCalled();
  });

  it('pomija reguły w okresie karencji (zapytanie filtruje cooldownUntil)', async () => {
    const t = zbuduj([]);
    await t.svc.runEligibleChecks();
    const where = (t.prisma.walletAutoTopup.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.enabled).toBe(true);
    expect(JSON.stringify(where.OR)).toContain('cooldownUntil');
  });

  it('saldo poniżej progu → jedno obciążenie na kwotę reguły w groszach, klucz idempotencji na godzinę', async () => {
    const t = zbuduj([regula({ topupAmount: D(123.45) })]);
    await t.svc.runEligibleChecks();
    expect(t.stripe.createOffSessionPaymentIntent).toHaveBeenCalledTimes(1);
    const arg = (t.stripe.createOffSessionPaymentIntent.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg).toMatchObject({
      customerId: 'cus_1',
      stripePaymentMethodId: 'pm_domyslna',
      amountMinor: 12345,
      currency: 'PLN',
      metadata: { verris_kind: 'wallet_auto_topup', verris_user_id: 'u1' },
    });
    expect(String(arg.idempotencyKey)).toMatch(/^auto-topup:intent:u1:\d+$/);
    const upd = (t.prisma.walletAutoTopup.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(upd.lastAttemptOk).toBe(true);
    expect((upd.cooldownUntil as Date).getTime()).toBeGreaterThan(Date.now());
    // Sukces nie księguje portfela tutaj — robi to webhook payment_intent.succeeded (bez podwójnego dopisania).
    expect(t.mailer.send).not.toHaveBeenCalled();
  });

  it.each([
    ['saldo równe progowi', regula({}, { walletBalance: D(50) })],
    ['saldo powyżej progu', regula({}, { walletBalance: D(80) })],
    ['inna waluta portfela', regula({}, { walletCurrency: 'EUR' })],
    ['brak klienta Stripe', regula({}, { stripeCustomerId: null })],
    ['kwota poniżej 1 zł', regula({ topupAmount: D(0.5) })],
  ])('nie obciąża: %s', async (_n, r) => {
    const t = zbuduj([r]);
    await t.svc.runEligibleChecks();
    expect(t.stripe.createOffSessionPaymentIntent).not.toHaveBeenCalled();
  });

  it('wskazana metoda szukana tylko wśród metod TEGO klienta; cudza → brak obciążenia, mail i karencja', async () => {
    const t = zbuduj([regula({ paymentMethodId: 'pm_row_obcy' })], { pmRow: null });
    await t.svc.runEligibleChecks();
    expect(t.prisma.paymentMethod.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', id: 'pm_row_obcy', provider: 'STRIPE' },
    });
    expect(t.stripe.createOffSessionPaymentIntent).not.toHaveBeenCalled();
    const fail = (t.prisma.walletAutoTopup.updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(fail.lastAttemptOk).toBe(false);
    expect(fail.cooldownUntil).toBeInstanceOf(Date);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'WALLET_AUTO_TOPUP_FAILED' }));
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
  });

  it('wskazana własna metoda → obciążenie jej providerRef, nie domyślnej', async () => {
    const t = zbuduj([regula({ paymentMethodId: 'pm_row_1' })], { pmRow: { providerRef: 'pm_wybrana' } });
    await t.svc.runEligibleChecks();
    const arg = (t.stripe.createOffSessionPaymentIntent.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.stripePaymentMethodId).toBe('pm_wybrana');
  });

  it('3DS (requires_action) → porażka z mailem, bez księgowania', async () => {
    const t = zbuduj([regula()], { pi: { id: 'pi_3ds', status: 'requires_action' } });
    await t.svc.runEligibleChecks();
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WALLET_AUTO_TOPUP_FAILED', details: expect.objectContaining({ stripeRef: 'pi_3ds' }) }),
    );
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
  });

  it('błąd Stripe przy jednej regule nie zatrzymuje kolejnych', async () => {
    const t = zbuduj([regula(), regula({ userId: 'u2' }, { id: 'u2' })], { piThrows: new Error('card_declined') });
    await t.svc.runEligibleChecks();
    expect(t.stripe.createOffSessionPaymentIntent).toHaveBeenCalledTimes(2);
    expect(t.mailer.send).toHaveBeenCalledTimes(2);
  });

  describe('upsertForUser — walidacja', () => {
    const dto = { enabled: true, thresholdPln: '50', topupAmountPln: '100', localPaymentMethodId: null };
    it.each([
      [{ thresholdPln: '-1' }],
      [{ topupAmountPln: '0' }],
      [{ topupAmountPln: '10000.01' }],
    ])('odrzuca %j', async (zmiana) => {
      const t = zbuduj([]);
      await expect(t.svc.upsertForUser('u1', { ...dto, ...zmiana })).rejects.toBeInstanceOf(BadRequestException);
      expect(t.prisma.walletAutoTopup.upsert).not.toHaveBeenCalled();
    });

    it('odrzuca cudzą metodę płatności', async () => {
      const t = zbuduj([], { pmRow: null });
      await expect(t.svc.upsertForUser('u1', { ...dto, localPaymentMethodId: 'pm_row_obcy' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.prisma.paymentMethod.findFirst).toHaveBeenCalledWith({
        where: { id: 'pm_row_obcy', userId: 'u1', provider: 'STRIPE' },
      });
    });
  });
});
