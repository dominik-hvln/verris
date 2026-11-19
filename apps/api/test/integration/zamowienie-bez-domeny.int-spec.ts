import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { AdresTechnicznyService } from '../../src/servers/adres-techniczny.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Paczka 129 (feedback bety 19.11.2026, pkt 1–2) – zakup samego hostingu bez domeny. Przed paczką API odrzucało
 * zamówienie hostingu bez `domain` („Domena jest wymagana”), a konto DA nie miało adresu, pod którym strona działa
 * przed podłączeniem domeny. Teraz: adres techniczny `v…….<HOSTING_TECH_DOMAIN>` zapisany na usłudze (unikalny
 * indeks w bazie) i użyty jako domena zamówienia aż do kolejki zakładania konta.
 */
const ENV: Record<string, string> = { HOSTING_TECH_DOMAIN: 'verris-host.pl', CLIENT_PANEL_URL: 'https://panel.verris.pl' };

function uslugi(o: { domenaTechniczna?: boolean } = {}) {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const kolejka: Array<{ subscriptionId: string; domain: string }> = [];
  const queue = { isAsync: () => true, enqueueWalletProvision: async (z: { subscriptionId: string; domain: string }) => void kolejka.push(z) };
  const provisioning = { sprawdzDomeneGlowna: async () => undefined, sprawdzMiejsce: async () => undefined };
  const env = o.domenaTechniczna === false ? {} : ENV;
  const ovh = { isConfigured: () => true, request: async () => undefined };
  const adres = new AdresTechnicznyService(p, { get: (k: string) => env[k] } as never, audit, ovh as never);
  const svc = new SubscriptionsService(
    p, audit, ledger, null as never, provisioning as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, { safeAward: () => undefined } as never,
    { getTrialOffer: async () => ({ cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 }) } as never, null as never,
    adres,
  );
  return { svc, kolejka };
}

let n = 0;
const klient = () => {
  n += 1;
  return prisma().user.create({ data: { email: `bez-domeny-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 200 } });
};
const zamowienie = (planId: string, extra: Record<string, unknown> = {}) =>
  ({ planId, interval: 'MONTH', paymentSource: 'WALLET', immediatePerformanceConsent: true, ...extra }) as never;

describe('zamówienie hostingu bez domeny (adres techniczny)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('adres techniczny zapisany na usłudze i przekazany do zakładania konta jako domena', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { svc, kolejka } = uslugi();
    expect(svc.zamowienieBezDomeny()).toEqual({ dostepne: true });
    const wynik = await svc.create(k.id, zamowienie(plan.id, { bezDomeny: true }));
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: wynik.subscription.id } });
    expect(s.adresTechniczny).toMatch(/^v[a-z0-9]{7}\.verris-host\.pl$/);
    // Identyfikator to nie login konta (serviceTag) – login nie trafia do publicznego DNS.
    expect(s.adresTechniczny!.split('.')[0]).not.toBe(s.serviceTag);
    expect(kolejka).toEqual([expect.objectContaining({ subscriptionId: s.id, domain: s.adresTechniczny })]);
  });

  it('dwie usługi – dwa różne adresy (unikalny indeks)', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { svc } = uslugi();
    await svc.create(k.id, zamowienie(plan.id, { bezDomeny: true }));
    await svc.create(k.id, zamowienie(plan.id, { bezDomeny: true }));
    const adresy = (await prisma().subscription.findMany({ select: { adresTechniczny: true } })).map((s) => s.adresTechniczny);
    expect(new Set(adresy).size).toBe(2);
  });

  it('bez skonfigurowanej domeny technicznej – czytelny błąd po polsku, zamówienie nie powstaje', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { svc } = uslugi({ domenaTechniczna: false });
    expect(svc.zamowienieBezDomeny()).toEqual({ dostepne: false });
    await expect(svc.create(k.id, zamowienie(plan.id, { bezDomeny: true }))).rejects.toThrow('Zamówienie bez domeny jest chwilowo niedostępne – podaj domenę.');
    expect(await prisma().subscription.count()).toBe(0);
  });

  it('poczta bez domeny – odmowa (poczta działa w domenie klienta)', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 15, productKind: 'EMAIL' });
    await expect(uslugi().svc.create(k.id, zamowienie(plan.id, { bezDomeny: true }))).rejects.toThrow(/podaj domenę/);
    expect(await prisma().subscription.count()).toBe(0);
  });

  it('hosting bez domeny i bez opcji „bez domeny” – jak dotąd wymagana domena', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 45 });
    await expect(uslugi().svc.create(k.id, zamowienie(plan.id))).rejects.toThrow('Domena jest wymagana dla tego produktu.');
  });
});
