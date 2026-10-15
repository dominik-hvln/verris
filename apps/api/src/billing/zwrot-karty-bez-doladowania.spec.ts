import { BillingService } from './billing.service.js';

/**
 * Przegląd 15.10 — zwrot albo spór (chargeback) za płatność kartą, która NIE była doładowaniem portfela (np. faktura
 * subskrypcji kartą): wcześniej `brak doładowania — pomijam` i zdarzenie PROCESSED, usługa działała dalej.
 */
describe('Stripe — zwrot/spór bez doładowania', () => {
  function stanowisko() {
    const svc = Object.create(BillingService.prototype) as Record<string, unknown>;
    const createMany = vi.fn(async () => ({ count: 1 }));
    const record = vi.fn(async () => undefined);
    svc.prisma = {
      walletTransaction: { findFirst: vi.fn(async () => null) },
      user: {
        findFirst: vi.fn(async () => ({ id: 'u1', email: 'klient@firma.pl' })),
        findMany: vi.fn(async () => [{ id: 'adm1' }, { id: 'adm2' }]),
      },
      invoice: { findFirst: vi.fn(async () => ({ id: 'f1', number: 'VFV/2027/01/0007' })) },
      notification: { createMany },
    };
    svc.audit = { record };
    svc.logger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
    const zwrot = (svc as unknown as { handleZwrotPlatnosci: (e: unknown) => Promise<void> }).handleZwrotPlatnosci.bind(svc);
    return { zwrot, createMany, record };
  }

  it('spór o płatność za fakturę subskrypcji: wpis w dzienniku i alarm dla każdego admina (klient, kwota, faktura)', async () => {
    const { zwrot, createMany, record } = stanowisko();
    await zwrot({
      id: 'evt_1',
      type: 'charge.dispute.created',
      data: { object: { payment_intent: 'pi_sub', amount: 4500, reason: 'fraudulent', customer: 'cus_1', invoice: 'in_1' } },
    });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STRIPE_PLATNOSC_SPOR', userId: 'u1', details: expect.objectContaining({ faktura: 'VFV/2027/01/0007', kwota: '45.00' }) }));
    const dane = (createMany.mock.calls[0] as unknown as [{ data: Array<{ userId: string; body: string; link: string }> }])[0].data;
    expect(dane.map((d) => d.userId)).toEqual(['adm1', 'adm2']);
    expect(dane[0].body).toContain('klient@firma.pl: 45.00 zł (pi_sub), faktura VFV/2027/01/0007');
    expect(dane[0].link).toBe('/customers/u1');
  });

  it('zwrot (charge.refunded) bez doładowania — też zgłoszony, z kwotą zwróconą', async () => {
    const { zwrot, record } = stanowisko();
    await zwrot({ id: 'evt_2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_sub', amount: 4500, amount_refunded: 2000, customer: 'cus_1' } } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STRIPE_PLATNOSC_ZWROT', details: expect.objectContaining({ kwota: '20.00' }) }));
  });
});
