import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Audyt Fal 2 — zawieszenie przez obsługę a zaległość klienta, na prawdziwym PostgreSQL (węzeł podstawiony):
 *  - nadużycie na usłudze zawieszonej za brak płatności zapisuje się jako nowy powód — wpłata (harmonogram, Stripe)
 *    jej nie odwiesza, a pracownik bez BILLING_MANAGE nie przywraca jej jako opłaconej;
 *  - „zawieś (decyzja obsługi) i odwieś” usługi zaległej (PAST_DUE) wymaga BILLING_MANAGE.
 */
const naWezle: string[] = [];
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const ledger = new WalletLedgerService(p);
  const subs = new SubscriptionsService(
    p, audit, ledger, null as never, null as never, null as never, null as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never,
    null as never, null as never,
  );
  const wezel = subs as unknown as Record<'suspendOnDa' | 'unsuspendOnDa', (s: string, u: string) => Promise<void>>;
  wezel.suspendOnDa = async (_s, u) => void naWezle.push(u);
  wezel.unsuspendOnDa = async (_s, u) => void naWezle.push(`-${u}`);
  const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
  const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };
  return {
    subs,
    zawieszenie: new ZawieszenieOperatoraService(p, subs),
    harmonogram: new RenewalScheduler(p, ledger, subs, audit, promo, eco as never),
  };
}

async function pracownik(uprawnienia: string[]) {
  const z = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const r = await prisma().staffRole.create({ data: { name: `rola-${z}`, permissions: uprawnienia } });
  const u = await prisma().user.create({ data: { email: `op-${z}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
  await prisma().staffRoleAssignment.create({ data: { userId: u.id, roleId: r.id } });
  return u.id;
}

/** Usługa z portfela, okres minął wczoraj (zaległość), klient bez środków. */
async function zalegla(status: 'PAST_DUE' | 'ACTIVE' = 'PAST_DUE') {
  const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });
  await prisma().subscription.update({
    where: { id: k.subscription.id },
    data: { status, paymentSource: 'WALLET', priceAmount: 45, currentPeriodEnd: new Date(Date.now() - 86_400_000) },
  });
  return k;
}
const stan = async (id: string) => (await prisma().subscription.findUniqueOrThrow({ where: { id } })).status;
const POWOD = 'Phishing potwierdzony na podstronie /login.';

describe('Audyt Fal 2 — zawieszenie przez obsługę a zaległość', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    naWezle.length = 0;
  });
  afterAll(rozlacz);

  it('nadużycie na usłudze zawieszonej za brak płatności: nowy powód w zdarzeniach i dzienniku; po doładowaniu portfela usługa NIE wraca sama', async () => {
    const { subs, zawieszenie, harmonogram } = uslugi();
    const k = await zalegla();
    await subs.suspend({ subscriptionId: k.subscription.id, reason: 'GRACE_EXPIRED', tylkoGdyStatus: SubscriptionStatus.PAST_DUE });
    expect(naWezle).toEqual([k.account.daUsername]);

    const l3 = await pracownik(['SUBSCRIPTIONS_SUSPEND']);
    await zawieszenie.zawies({ subscriptionId: k.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', reason: 'ABUSE', powod: POWOD });
    // Konto na węźle już zawieszone — drugiego wywołania nie ma.
    expect(naWezle).toEqual([k.account.daUsername]);
    const ostatnie = await prisma().subscriptionEvent.findFirstOrThrow({ where: { subscriptionId: k.subscription.id, type: 'SUSPENDED' }, orderBy: { createdAt: 'desc' } });
    expect(ostatnie.details).toMatchObject({ reason: 'ABUSE', poprzedniPowod: 'GRACE_EXPIRED', zaleglosc: true });
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'SUBSCRIPTION_SUSPENDED', actorUserId: l3 } });
    expect(wpis.details).toMatchObject({ reason: 'ABUSE', juzZawieszona: true, poprzedniPowod: 'GRACE_EXPIRED' });

    // Klient doładowuje portfel — przywrócenie po zapłacie dotyczy tylko zawieszeń za brak płatności.
    await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: 500 } });
    await harmonogram.runPaymentSuspensionRestore();
    expect(await stan(k.subscription.id)).toBe('SUSPENDED');
    await expect(harmonogram.retryPastDueNow(k.user.id, k.subscription.id)).rejects.toThrow(/zawiesiła obsługa/);
    expect(await stan(k.subscription.id)).toBe('SUSPENDED');

    // Wyjaśnione nadużycie: pracownik bez BILLING_MANAGE nie przywraca usługi z zaległością; z nim — tak.
    await expect(zawieszenie.odwies({ subscriptionId: k.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', powod: 'Wyjaśnione z klientem.' })).rejects.toThrow(/BILLING_MANAGE/);
    const l4 = await pracownik(['SUBSCRIPTIONS_SUSPEND', 'BILLING_MANAGE']);
    await zawieszenie.odwies({ subscriptionId: k.subscription.id, aktorUserId: l4, aktorRola: 'STAFF', powod: 'Wyjaśnione, zaległość do opłaty.' });
    expect(await stan(k.subscription.id)).toBe('ACTIVE');
  });

  it('ponowne zawieszenie tym samym albo innym powodem obsługi — bez nowego zdarzenia (no-op jak dotąd)', async () => {
    const { zawieszenie } = uslugi();
    const k = await zalegla('ACTIVE');
    const l3 = await pracownik(['SUBSCRIPTIONS_SUSPEND']);
    await zawieszenie.zawies({ subscriptionId: k.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', reason: 'ABUSE', powod: POWOD });
    await zawieszenie.zawies({ subscriptionId: k.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', reason: 'MANUAL_ADMIN', powod: POWOD });
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: k.subscription.id, type: 'SUSPENDED' } })).toBe(1);
  });

  it('usługa zaległa (PAST_DUE): „zawieś i odwieś” przez pracownika bez BILLING_MANAGE nie przywraca ACTIVE (403); usługa opłacona — bez zmian', async () => {
    const { zawieszenie } = uslugi();
    const l3 = await pracownik(['SUBSCRIPTIONS_SUSPEND']);
    const k = await zalegla('PAST_DUE');
    await zawieszenie.zawies({ subscriptionId: k.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', reason: 'MANUAL_ADMIN', powod: 'Klient prosił o wstrzymanie strony.' });
    const z = await prisma().subscriptionEvent.findFirstOrThrow({ where: { subscriptionId: k.subscription.id, type: 'SUSPENDED' } });
    expect(z.details).toMatchObject({ reason: 'MANUAL_ADMIN', statusPrzed: 'PAST_DUE' });
    await expect(zawieszenie.odwies({ subscriptionId: k.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', powod: 'Klient prosi o wznowienie.' })).rejects.toThrow(/BILLING_MANAGE/);
    expect(await stan(k.subscription.id)).toBe('SUSPENDED');

    const oplacona = await zalegla('ACTIVE');
    await zawieszenie.zawies({ subscriptionId: oplacona.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', reason: 'MANUAL_ADMIN', powod: 'Klient prosił o wstrzymanie strony.' });
    await zawieszenie.odwies({ subscriptionId: oplacona.subscription.id, aktorUserId: l3, aktorRola: 'STAFF', powod: 'Klient prosi o wznowienie.' });
    expect(await stan(oplacona.subscription.id)).toBe('ACTIVE');
  });
});
