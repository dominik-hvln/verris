import { createHash } from 'crypto';
import { SubscriptionStatus, WalletTxType, type PrismaClient } from '@verris/database';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { ZmianaWlascicielaService } from '../../src/subscriptions/zmiana-wlasciciela.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * K2 (PB-53.5) — zmiana właściciela usługi przez administratora na prawdziwej bazie: co przechodzi za usługą
 * (usługa, konto, certyfikaty, analityka), co zostaje (faktury, portfel, zlecenia migracji), dziennik u obu klientów,
 * odebranie dostępu IAM poprzedniego właściciela — i „wszystko albo nic” przy awarii w środku transakcji.
 */

const DNI = 86_400_000;
let n = 0;
const skrot = (s: string) => createHash('sha256').update(s).digest('hex');

async function klient(over: Record<string, unknown> = {}) {
  n += 1;
  return prisma().user.create({ data: { email: `k2-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', emailVerifiedAt: new Date(), walletBalance: 100, ...over } as never });
}

/** Usługa poprzedniego właściciela ze wszystkim, co ma przejść albo zostać, plus jego IAM. */
async function scena() {
  const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
  const p = prisma();
  const A = await p.user.update({ where: { id: k.user.id }, data: { emailVerifiedAt: new Date(), walletBalance: 100 } });
  const sub = await p.subscription.update({
    where: { id: k.subscription.id },
    data: { status: SubscriptionStatus.ACTIVE, paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 5 * DNI), currentPeriodEnd: new Date(Date.now() + 25 * DNI) },
  });
  const inna = await p.subscription.create({ data: { userId: A.id, planId: sub.planId, interval: 'MONTH', priceAmount: 45, status: SubscriptionStatus.ACTIVE } });
  const B = await klient();
  const faktura = await p.invoice.create({ data: { userId: A.id, subscriptionId: sub.id, number: `VFV/K2/${n}`, amount: 45 } as never });
  const oplata = await p.walletTransaction.create({ data: { userId: A.id, type: WalletTxType.CHARGE_AUTOSCALING, amount: -1.5, balanceAfter: 98.5, subscriptionId: sub.id } });
  const ssl = await p.sslOrder.create({
    data: { userId: A.id, subscriptionId: sub.id, domain: k.account.domain, productId: 1, productName: 'DV', validation: 'DNS', privateKeyEnc: 'enc', csr: 'csr', priceAmount: 50, status: 'INSTALLED' },
  });
  await p.analyticsSite.create({ data: { subscriptionId: sub.id, userId: A.id, domain: k.account.domain, siteKey: `vas_${n}` } });
  await p.gitWebhook.create({ data: { accountId: k.account.id, domain: k.account.domain, tokenHash: skrot(`hook-${n}`) } });
  const migracja = await p.migrationRequest.create({
    data: { subscriptionId: sub.id, userId: A.id, sourceBundleEnc: 'zaszyfrowane-hasla-starego-hostingu', status: 'COMPLETED', completedAt: new Date() },
  });
  // IAM poprzedniego właściciela: subkonto tylko do tej usługi, subkonto do dwóch usług, członek tylko do tej usługi,
  // członek do całego konta, zaproszenie tylko do tej usługi.
  const subTylko = await klient({ customerOwnerId: A.id, customerPermissions: ['SERVICES_READ'], subaccountServiceIds: [sub.id] });
  const subDwie = await klient({ customerOwnerId: A.id, customerPermissions: ['SERVICES_READ'], subaccountServiceIds: [sub.id, inna.id] });
  const dev = await klient();
  const devCaly = await klient();
  await p.customerMembership.create({ data: { ownerUserId: A.id, memberUserId: dev.id, permissions: ['SERVICES_READ'], serviceIds: [sub.id] } });
  await p.customerMembership.create({ data: { ownerUserId: A.id, memberUserId: devCaly.id, permissions: ['SERVICES_READ'], serviceIds: [] } });
  const zaproszenie = await p.customerSubaccountInvite.create({
    data: { ownerUserId: A.id, email: 'zaproszony@test.verris.pl', tokenHash: skrot(`inv-${n}`), permissions: ['SERVICES_READ'], serviceIds: [sub.id], expiresAt: new Date(Date.now() + DNI) },
  });
  const admin = await klient({ role: 'ADMIN' });
  ADMIN = { userId: admin.id, role: 'ADMIN' };
  return { k, A, B, sub, inna, faktura, oplata, ssl, migracja, subTylko, subDwie, dev, devCaly, zaproszenie };
}

function serwis(p: PrismaClient = prisma()) {
  const mailer = { send: vi.fn().mockResolvedValue({ delivered: true }) };
  return { s: new ZmianaWlascicielaService(p as never, mailer as never, { get: () => 'https://panel.test' } as never), mailer };
}
let ADMIN = { userId: '', role: 'ADMIN' };
const POWOD = 'Sprzedaż sklepu — zgłoszenie obu stron';
const jwt = () => new JwtStrategy({ get: () => 'sekret' } as never, prisma() as never);

/** Czy tożsamość z tokenu widzi usługę — ten sam warunek co lista usług panelu (services.controller.ts). */
async function widzi(ctx: { userId: string; serviceScope?: string[] }, subscriptionId: string) {
  const zakres = ctx.serviceScope?.length ? { id: { in: ctx.serviceScope } } : {};
  return !!(await prisma().subscription.findFirst({ where: { AND: [{ id: subscriptionId, userId: ctx.userId }, zakres] } }));
}

describe('K2 — zmiana właściciela usługi', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('przenosi usługę z zależnościami; faktury i portfel zostają; dziennik u obu; dostęp IAM poprzedniego znika', async () => {
    const x = await scena();
    const p = prisma();
    const { s, mailer } = serwis();
    // Przed: członek i subkonto widzą usługę.
    expect(await widzi((await jwt().validate({ sub: x.dev.id, email: x.dev.email, role: 'USER', actingFor: x.A.id }))!, x.sub.id)).toBe(true);
    expect(await widzi((await jwt().validate({ sub: x.subTylko.id, email: x.subTylko.email, role: 'USER' }))!, x.sub.id)).toBe(true);

    const podglad = await s.podglad(x.sub.id, x.B.email.toUpperCase());
    expect(podglad).toMatchObject({ nowyWlasciciel: { id: x.B.id }, odmowy: [] });

    const r = await s.przenies({ subscriptionId: x.sub.id, operator: ADMIN, email: x.B.email, powod: POWOD, potwierdzenie: x.B.email.toUpperCase() });
    expect(r.nowyWlasciciel.id).toBe(x.B.id);

    // Za usługą
    expect((await p.subscription.findUniqueOrThrow({ where: { id: x.sub.id } })).userId).toBe(x.B.id);
    expect((await p.account.findUniqueOrThrow({ where: { id: x.k.account.id } })).userId).toBe(x.B.id);
    expect((await p.sslOrder.findUniqueOrThrow({ where: { id: x.ssl.id } })).userId).toBe(x.B.id);
    expect((await p.analyticsSite.findFirstOrThrow({ where: { subscriptionId: x.sub.id } })).userId).toBe(x.B.id);
    expect(await p.gitWebhook.count({ where: { accountId: x.k.account.id } })).toBe(0);
    // Inna usługa poprzedniego właściciela nie rusza się.
    expect((await p.subscription.findUniqueOrThrow({ where: { id: x.inna.id } })).userId).toBe(x.A.id);

    // Zostaje u poprzedniego
    expect((await p.invoice.findUniqueOrThrow({ where: { id: x.faktura.id } })).userId).toBe(x.A.id);
    expect((await p.walletTransaction.findUniqueOrThrow({ where: { id: x.oplata.id } })).userId).toBe(x.A.id);
    const mig = await p.migrationRequest.findUniqueOrThrow({ where: { id: x.migracja.id } });
    expect(mig).toMatchObject({ userId: x.A.id, sourceBundleEnc: '' });
    expect(mig.secretsPurgedAt).toBeInstanceOf(Date);
    expect(Number((await p.user.findUniqueOrThrow({ where: { id: x.A.id } })).walletBalance)).toBe(100);
    // Historia autoskalowania nowego właściciela nie pokazuje obciążeń portfela poprzedniego.
    const subs = new (SubscriptionsService as unknown as new (...a: unknown[]) => SubscriptionsService)(p, ...Array(12).fill(null));
    expect((await subs.getAutoscalingHistory(x.B.id, x.sub.id)).charges).toEqual([]);

    // Zdarzenie usługi bez adresów i powodu (oś „Co się działo” widzi już tylko nowy właściciel).
    const zdarzenia = await p.subscriptionEvent.findMany({ where: { subscriptionId: x.sub.id, type: 'OWNER_CHANGED' } });
    expect(zdarzenia.map((e) => e.details)).toEqual([{ source: 'OPERATOR' }]);

    // Dziennik: wpis klienta u obu (bez adresu drugiej strony i bez powodu), dziennik zespołu z powodem u obu.
    const users = new UsersService(p as never, null as never, null as never, null as never, null as never, null as never);
    for (const [kto, kierunek, inny] of [[x.A, 'oddana', x.B], [x.B, 'przyjeta', x.A]] as const) {
      const akt = (await users.listMyActivity(kto.id)).events.filter((e) => e.action === 'SUBSCRIPTION_OWNER_CHANGED');
      expect(akt).toHaveLength(1);
      expect(akt[0]).toMatchObject({ actor: 'obsługa Verris' });
      const wpis = await p.auditLog.findFirstOrThrow({ where: { userId: kto.id, action: 'SUBSCRIPTION_OWNER_CHANGED' } });
      expect(wpis.details).toEqual({ subscriptionId: x.sub.id, domain: x.k.account.domain, kierunek });
      expect(JSON.stringify(akt)).not.toContain(inny.email);
      expect(JSON.stringify(akt)).not.toContain('Sprzedaż');
      const zespol = await p.auditLog.findFirstOrThrow({ where: { userId: kto.id, action: 'OPERATOR_ACCOUNT_CHANGED' } });
      expect(zespol).toMatchObject({ actorUserId: ADMIN.userId, details: expect.objectContaining({ akcja: 'zmiana-wlasciciela', powod: POWOD }) });
    }

    // IAM: ostatnia usługa z listy → wyłączenie (nie pusta lista = „całe konto”); druga usługa zostaje.
    expect(await p.user.findUniqueOrThrow({ where: { id: x.subTylko.id } })).toMatchObject({ subaccountServiceIds: [x.sub.id] });
    expect((await p.user.findUniqueOrThrow({ where: { id: x.subTylko.id } })).subaccountDisabledAt).toBeInstanceOf(Date);
    expect(await p.user.findUniqueOrThrow({ where: { id: x.subDwie.id } })).toMatchObject({ subaccountServiceIds: [x.inna.id], subaccountDisabledAt: null });
    expect((await p.customerMembership.findFirstOrThrow({ where: { memberUserId: x.dev.id } })).disabledAt).toBeInstanceOf(Date);
    expect(await p.customerSubaccountInvite.findUniqueOrThrow({ where: { id: x.zaproszenie.id } })).toMatchObject({ status: 'REVOKED' });
    // Tożsamości poprzedniego właściciela nie widzą już usługi; nowy właściciel widzi.
    await expect(jwt().validate({ sub: x.subTylko.id, email: x.subTylko.email, role: 'USER' })).rejects.toThrow(/disabled/);
    const devCtx = await jwt().validate({ sub: x.dev.id, email: x.dev.email, role: 'USER', actingFor: x.A.id });
    expect(devCtx.userId).toBe(x.dev.id); // członkostwo wyłączone — token wraca do własnego konta
    expect(await widzi(devCtx, x.sub.id)).toBe(false);
    expect(await widzi((await jwt().validate({ sub: x.devCaly.id, email: x.devCaly.email, role: 'USER', actingFor: x.A.id }))!, x.sub.id)).toBe(false);
    expect(await widzi((await jwt().validate({ sub: x.subDwie.id, email: x.subDwie.email, role: 'USER' }))!, x.sub.id)).toBe(false);
    expect(await widzi({ userId: x.A.id }, x.sub.id)).toBe(false);
    expect(await widzi({ userId: x.B.id }, x.sub.id)).toBe(true);

    // Mail do obu stron, każdy na swój adres.
    expect(mailer.send.mock.calls.map((c) => (c[0] as { to: string; tag: string }).to)).toEqual([x.A.email, x.B.email]);
  });

  it('awaria w środku transakcji (zapis dziennika) → nic się nie zmienia', async () => {
    const x = await scena();
    const p = prisma();
    const zepsuta = new Proxy(p, {
      get(t, k) {
        if (k !== '$transaction') return Reflect.get(t, k);
        return (fn: (tx: unknown) => Promise<unknown>) =>
          t.$transaction((tx) =>
            fn(new Proxy(tx, { get: (tt, kk) => (kk === 'auditLog' ? { createMany: async () => { throw new Error('awaria zapisu dziennika'); } } : Reflect.get(tt, kk)) })),
          );
      },
    });
    const { s, mailer } = serwis(zepsuta as PrismaClient);
    await expect(s.przenies({ subscriptionId: x.sub.id, operator: ADMIN, email: x.B.email, powod: POWOD, potwierdzenie: x.B.email })).rejects.toThrow('awaria zapisu dziennika');

    expect((await p.subscription.findUniqueOrThrow({ where: { id: x.sub.id } })).userId).toBe(x.A.id);
    expect((await p.account.findUniqueOrThrow({ where: { id: x.k.account.id } })).userId).toBe(x.A.id);
    expect((await p.sslOrder.findUniqueOrThrow({ where: { id: x.ssl.id } })).userId).toBe(x.A.id);
    expect(await p.gitWebhook.count({ where: { accountId: x.k.account.id } })).toBe(1);
    expect(await p.migrationRequest.findUniqueOrThrow({ where: { id: x.migracja.id } })).toMatchObject({ sourceBundleEnc: 'zaszyfrowane-hasla-starego-hostingu', secretsPurgedAt: null });
    expect(await p.user.findUniqueOrThrow({ where: { id: x.subTylko.id } })).toMatchObject({ subaccountDisabledAt: null });
    expect(await p.customerMembership.findFirstOrThrow({ where: { memberUserId: x.dev.id } })).toMatchObject({ disabledAt: null });
    expect(await p.customerSubaccountInvite.findUniqueOrThrow({ where: { id: x.zaproszenie.id } })).toMatchObject({ status: 'PENDING' });
    expect(await p.subscriptionEvent.count({ where: { subscriptionId: x.sub.id, type: 'OWNER_CHANGED' } })).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('odmowy na bazie: zaległa płatność, migracja w toku, nowy właściciel zablokowany — bez żadnej zmiany', async () => {
    const x = await scena();
    const p = prisma();
    const { s, mailer } = serwis();
    const zlec = (email = x.B.email) => s.przenies({ subscriptionId: x.sub.id, operator: ADMIN, email, powod: POWOD, potwierdzenie: email });

    await p.subscription.update({ where: { id: x.sub.id }, data: { status: SubscriptionStatus.PAST_DUE } });
    await expect(zlec()).rejects.toThrow(/zaległą płatność/);
    await p.subscription.update({ where: { id: x.sub.id }, data: { status: SubscriptionStatus.ACTIVE } });

    const wToku = await p.migrationRequest.create({ data: { subscriptionId: x.sub.id, userId: x.A.id, sourceBundleEnc: 'x', status: 'RUNNING' } });
    await expect(zlec()).rejects.toThrow(/przenoszenie strony/);
    await p.migrationRequest.delete({ where: { id: wToku.id } });

    const zablokowany = await klient({ loginBlocked: true });
    await expect(zlec(zablokowany.email)).rejects.toThrow(/zablokowane/);
    await expect(zlec(x.A.email)).rejects.toThrow(/ten sam klient/);
    await expect(s.podglad(x.sub.id, 'nikt@test.verris.pl')).resolves.toMatchObject({ nowyWlasciciel: null, odmowy: ['Nie ma klienta z tym adresem e-mail.'] });

    expect((await p.subscription.findUniqueOrThrow({ where: { id: x.sub.id } })).userId).toBe(x.A.id);
    expect(await p.auditLog.count({ where: { action: { in: ['SUBSCRIPTION_OWNER_CHANGED', 'OPERATOR_ACCOUNT_CHANGED'] } } })).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();

    // Przeniesienie z powrotem działa tak samo (po ustąpieniu przeszkód).
    await zlec();
    const zPowrotem = await s.przenies({ subscriptionId: x.sub.id, operator: ADMIN, email: x.A.email, powod: 'Cofnięcie — pomyłka w adresie', potwierdzenie: x.A.email });
    expect(zPowrotem.nowyWlasciciel.id).toBe(x.A.id);
    expect((await p.account.findUniqueOrThrow({ where: { id: x.k.account.id } })).userId).toBe(x.A.id);
  });
});
