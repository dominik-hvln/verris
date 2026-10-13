import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * X-04 — sprzątanie zamówień nieopłaconych od 48 h na prawdziwej bazie. Harmonogram wybiera listę,
 * a potem anuluje zamówienia po kolei; klient, który zapłacił w tej chwili, nie może stracić usługi.
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  return new SubscriptionsService(
    p, audit, new WalletLedgerService(p), null as never, null as never, null as never, null as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never,
    null as never, null as never,
  );
}

async function zamowienie(godzinTemu: number) {
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const u = await prisma().user.create({ data: { email: `porz-${Date.now()}-${Math.random()}@test.verris.pl`, passwordHash: 'x' } });
  return prisma().subscription.create({
    data: { userId: u.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'PENDING_PAYMENT', createdAt: new Date(Date.now() - godzinTemu * 3600_000) },
  });
}
const status = async (id: string) => (await prisma().subscription.findUniqueOrThrow({ where: { id } })).status;

describe('X-04 porzucone zamówienia', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('nieopłacone od ponad 48 h: anulowane; młodsze zostają', async () => {
    const stare = await zamowienie(50);
    const mlode = await zamowienie(2);
    const r = await uslugi().abandonStalePendingPayments();
    expect(r.canceled).toBe(1);
    expect(await status(stare.id)).toBe('CANCELED');
    expect(await status(mlode.id)).toBe('PENDING_PAYMENT');
  });

  it('klient zapłacił między wyborem listy a anulowaniem: usługa zostaje', async () => {
    const s = await zamowienie(50);
    const serwis = uslugi();
    const p = prisma();
    const oryginal = p.subscription.findMany.bind(p.subscription);
    // Lista wybrana, a zanim harmonogram doszedł do tego zamówienia — płatność przestawiła je dalej.
    const szpieg = vi.spyOn(p.subscription, 'findMany').mockImplementationOnce(async (a: never) => {
      const lista = await oryginal(a);
      await p.subscription.update({ where: { id: s.id }, data: { status: 'PROVISIONING' } });
      return lista;
    });
    const r = await serwis.abandonStalePendingPayments();
    szpieg.mockRestore();
    expect(r.canceled).toBe(0);
    expect(await status(s.id)).toBe('PROVISIONING');
  });

  // Przegląd 13.10: zamówienie opłacone przez Paynow, którego realizacja nie przeszła — nie anulujemy (pieniądze są
  // w portfelu klienta), jeden alarm dla adminów, choć harmonogram widzi je co godzinę.
  it('opłacone przez Paynow, a nieuruchomione: zostaje, jeden alarm dla adminów', async () => {
    const s = await prisma().subscription.update({ where: { id: (await zamowienie(50)).id }, data: { paymentSource: 'WALLET' } });
    await prisma().user.create({ data: { email: `porz-admin-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    await prisma().paynowPlatnosc.create({
      data: { userId: s.userId, kwotaMinor: 4500, status: 'CONFIRMED', paymentId: `P-${s.id}`, meta: { kind: 'zamowienie', zamowienieTyp: 'nowa', subscriptionId: s.id } },
    });
    // Płatność za INNE zamówienie nie chroni tego.
    const inne = await zamowienie(50);
    await prisma().paynowPlatnosc.create({
      data: { userId: inne.userId, kwotaMinor: 4500, status: 'REJECTED', paymentId: `P-${inne.id}`, meta: { kind: 'zamowienie', zamowienieTyp: 'nowa', subscriptionId: inne.id } },
    });
    const serwis = uslugi();
    expect((await serwis.abandonStalePendingPayments()).canceled).toBe(1);
    await serwis.abandonStalePendingPayments();
    expect(await status(s.id)).toBe('PENDING_PAYMENT');
    expect(await status(inne.id)).toBe('CANCELED');
    const admini = await prisma().user.count({ where: { role: 'ADMIN' } });
    expect(await prisma().notification.count({ where: { title: 'Opłacone zamówienie czeka ponad 48 h' } })).toBe(admini);
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: s.id, type: 'OPLACONE_NIEURUCHOMIONE' } })).toBe(1);
  });
});
