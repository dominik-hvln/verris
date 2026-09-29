import { RenewalScheduler } from './renewal.scheduler.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Regulamin §7 ust. 3: prolongata 7 dni → zawieszenie → „jeżeli w ciągu kolejnych 14 dni zaległość
 * nie zostanie uregulowana, Umowa w zakresie tej Usługi wygasa”. Wygaśnięcie ustawia canceledAt,
 * od którego RetencjaKontService liczy 14 dni do usunięcia konta.
 */
const DZIEN = 24 * 60 * 60 * 1000;
const TERAZ = new Date('2026-10-20T03:00:00Z');

function scheduler(subs: Array<{ id: string; zawieszonaDniTemu: number; powod: string }>) {
  const prisma = {
    subscription: {
      findMany: vi.fn(async () =>
        subs.map((s) => ({
          id: s.id,
          status: 'SUSPENDED',
          events: [{ createdAt: new Date(TERAZ.getTime() - s.zawieszonaDniTemu * DZIEN), details: { reason: s.powod } }],
        })),
      ),
    },
  };
  const svc = {
    wygasPoZawieszeniu: vi.fn(async (id: string) => {
      if (id === 'zepsuta') throw new Error('Stripe 500');
      return { id };
    }),
  };
  const s = new RenewalScheduler(prisma as never, {} as never, svc as never, {} as never, {} as never, {} as never);
  return { s, svc };
}

describe('RenewalScheduler.runSuspensionExpiry — §7 ust. 3', () => {
  it('13 dni zawieszenia za brak płatności → jeszcze nic; 14 → wygaśnięcie', async () => {
    const { s, svc } = scheduler([
      { id: 'd13', zawieszonaDniTemu: 13, powod: 'GRACE_EXPIRED' },
      { id: 'd14', zawieszonaDniTemu: 14, powod: 'GRACE_EXPIRED' },
      { id: 'reczne', zawieszonaDniTemu: 20, powod: 'PAYMENT_FAILED' },
    ]);
    expect(await s.runSuspensionExpiry(TERAZ)).toBe(2);
    expect(svc.wygasPoZawieszeniu.mock.calls.map((c) => c[0])).toEqual(['d14', 'reczne']);
  });

  it('zawieszenie za nadużycie albo decyzją operatora nie wygasza umowy', async () => {
    const { s, svc } = scheduler([
      { id: 'abuse', zawieszonaDniTemu: 60, powod: 'ABUSE' },
      { id: 'admin', zawieszonaDniTemu: 60, powod: 'MANUAL_ADMIN' },
    ]);
    expect(await s.runSuspensionExpiry(TERAZ)).toBe(0);
    expect(svc.wygasPoZawieszeniu).not.toHaveBeenCalled();
  });

  it('błąd jednej usługi nie zatrzymuje pozostałych', async () => {
    const { s, svc } = scheduler([
      { id: 'zepsuta', zawieszonaDniTemu: 15, powod: 'GRACE_EXPIRED' },
      { id: 'ok', zawieszonaDniTemu: 15, powod: 'GRACE_EXPIRED' },
    ]);
    expect(await s.runSuspensionExpiry(TERAZ)).toBe(1);
    expect(svc.wygasPoZawieszeniu).toHaveBeenCalledWith('ok');
  });
});

function serwis(sub: Record<string, unknown> | null, opts: { stripeBlad?: boolean; wyprzedzona?: boolean } = {}) {
  const tx = {
    subscription: { updateMany: vi.fn(async () => ({ count: opts.wyprzedzona ? 0 : 1 })) },
    subscriptionEvent: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    subscription: { findUnique: vi.fn(async () => sub) },
    user: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const stripe = {
    cancelSubscription: vi.fn(async () => {
      if (opts.stripeBlad) throw new Error('Stripe niedostępny');
    }),
  };
  const n = {} as never;
  const svc = new SubscriptionsService(prisma as never, audit as never, n, stripe as never, n, n, n, n, { get: () => undefined } as never, n, n, n, n);
  return { svc, tx, audit, stripe };
}

const zawieszona = { id: 's1', userId: 'u1', status: 'SUSPENDED', paymentSource: 'WALLET', stripeSubscriptionId: null };

describe('SubscriptionsService.wygasPoZawieszeniu', () => {
  it('SUSPENDED → EXPIRED z canceledAt (start retencji), zdarzenie i audyt', async () => {
    const s = serwis(zawieszona);
    const wynik = await s.svc.wygasPoZawieszeniu('s1');
    expect(wynik?.status).toBe('EXPIRED');
    expect(s.tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', status: 'SUSPENDED' },
      data: expect.objectContaining({ status: 'EXPIRED', canceledAt: expect.any(Date) }),
    });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBSCRIPTION_EXPIRED' }));
  });

  it('karta: najpierw anulowanie w Stripe; błąd Stripe → wyjątek, baza bez zmian (ponowienie za godzinę)', async () => {
    const s = serwis({ ...zawieszona, paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_1' }, { stripeBlad: true });
    await expect(s.svc.wygasPoZawieszeniu('s1')).rejects.toThrow('Stripe niedostępny');
    expect(s.stripe.cancelSubscription).toHaveBeenCalledWith('sub_1', { atPeriodEnd: false });
    expect(s.tx.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('usługa już nie SUSPENDED (opłacona / webhook był pierwszy) → nic, bez audytu', async () => {
    expect(await serwis({ ...zawieszona, status: 'ACTIVE' }).svc.wygasPoZawieszeniu('s1')).toBeNull();
    const s = serwis(zawieszona, { wyprzedzona: true });
    expect(await s.svc.wygasPoZawieszeniu('s1')).toBeNull();
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});
