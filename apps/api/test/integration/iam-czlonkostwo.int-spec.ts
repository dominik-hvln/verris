import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { CustomerIamService } from '../../src/users/customer-iam.service.js';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { wZakresie } from '../../src/common/guards/zakres-uslug.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * PB-20 — udostępnianie wybranych usług i dostęp z własnego konta, na prawdziwej bazie.
 * Sedno: token z `actingFor` daje dokładnie członkostwo (uprawnienia + zakres), odebrany
 * dostęp działa przy następnym żądaniu, a zakres odcina cudze usługi i zasoby konta.
 */

const mailer = { send: async () => ({}) };
const config = { get: () => undefined };
let n = 0;
async function user(extra: Record<string, unknown> = {}) {
  n += 1;
  return prisma().user.create({ data: { email: `pb20-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', ...extra } });
}
function iam() {
  const p = prisma() as never;
  return new CustomerIamService(p, new AuditService(p), mailer as never, config as never);
}
function strategia() {
  return new JwtStrategy({ get: () => 'sekret-testowy' } as never, prisma() as never);
}
async function usluga(userId: string) {
  const plan = await utworzPlan();
  return prisma().subscription.create({
    data: { userId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN' } as never,
  });
}
/** Token zaproszenia nie wychodzi z serwisu (idzie mailem) — tworzymy zaproszenie z własnym tokenem. */
async function zaproszenie(ownerUserId: string, email: string, serviceIds: string[]) {
  const token = `tok-${Date.now()}-${Math.random().toString(36).slice(2)}-xxxxxxxx`;
  const { createHash } = await import('crypto');
  await prisma().customerSubaccountInvite.create({
    data: {
      ownerUserId, email, serviceIds, permissions: ['SERVICES_READ', 'FILES_MANAGE'],
      tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return token;
}

describe('PB-20 — członkostwo z własnego konta i zakres usług', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('zaproszenie na adres z kontem: przyjęcie własnym kontem, token z actingFor daje zakres', async () => {
    const wlasciciel = await user();
    const dev = await user();
    const s1 = await usluga(wlasciciel.id);
    const s2 = await usluga(wlasciciel.id);
    const token = await zaproszenie(wlasciciel.id, dev.email, [s1.id]);

    expect(await iam().inviteInfo(token)).toMatchObject({ maKonto: true, wybraneUslugi: true });
    await iam().acceptExisting({ userId: dev.id, principalUserId: dev.id }, token);
    expect(await iam().mojeKonta(dev.id)).toHaveLength(1);

    const ctx = await strategia().validate({ sub: dev.id, email: dev.email, role: 'USER', actingFor: wlasciciel.id });
    expect(ctx).toMatchObject({ userId: wlasciciel.id, principalUserId: dev.id, customerOwnerId: wlasciciel.id, serviceScope: [s1.id] });
    expect(wZakresie('GET', '/services/:id/hosting-dns', { id: s1.id }, ctx.serviceScope)).toBe(true);
    expect(wZakresie('GET', '/services/:id/hosting-dns', { id: s2.id }, ctx.serviceScope)).toBe(false);
    expect(wZakresie('GET', '/billing/wallet', {}, ctx.serviceScope)).toBe(false);

    // Właściciel odbiera dostęp → następne żądanie z tym samym tokenem działa już na koncie dewelopera.
    const [m] = (await iam().overview(wlasciciel.id, wlasciciel.id)).memberships;
    await iam().disableMembership(wlasciciel.id, wlasciciel.id, m.id);
    const po = await strategia().validate({ sub: dev.id, email: dev.email, role: 'USER', actingFor: wlasciciel.id });
    expect(po).toMatchObject({ userId: dev.id, customerOwnerId: null });
    expect(await iam().mozePrzelaczyc(dev.id, wlasciciel.id)).toBe(false);
  });

  it('zaproszenia nie przyjmie konto o innym adresie ani subkonto', async () => {
    const wlasciciel = await user();
    const dev = await user();
    const obcy = await user();
    const token = await zaproszenie(wlasciciel.id, dev.email, []);
    await expect(iam().acceptExisting({ userId: obcy.id, principalUserId: obcy.id }, token)).rejects.toMatchObject({ status: 403 });
    // Działając na cudzym koncie też nie — najpierw powrót na własne.
    await expect(iam().acceptExisting({ userId: 'inne', principalUserId: dev.id, actingFor: 'inne' }, token)).rejects.toMatchObject({ status: 403 });
  });

  it('zakres wskazujący cudzą usługę jest odrzucany przy zaproszeniu', async () => {
    const wlasciciel = await user();
    const inny = await user();
    const cudza = await usluga(inny.id);
    await expect(
      iam().invite(wlasciciel.id, wlasciciel.id, { email: 'nowy-pb20@test.verris.pl', permissions: ['SERVICES_READ'], serviceIds: [cudza.id] } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('subkonto z zakresem: strategia zwraca zakres z konta subkonta', async () => {
    const wlasciciel = await user();
    const s1 = await usluga(wlasciciel.id);
    const sub = await user({ customerOwnerId: wlasciciel.id, customerPermissions: ['SERVICES_READ'], subaccountServiceIds: [s1.id] });
    const ctx = await strategia().validate({ sub: sub.id, email: sub.email, role: 'USER' });
    expect(ctx).toMatchObject({ userId: wlasciciel.id, serviceScope: [s1.id] });
  });
});
