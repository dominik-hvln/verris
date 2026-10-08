import { AuditService } from '../../src/common/audit/audit.service.js';
import { PhpService } from '../../src/subscriptions/php.service.js';
import { KontoKlientaAdminController } from '../../src/subscriptions/konto-klienta.admin.controller.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * PB-42 — podgląd konta klienta przez obsługę na prawdziwej bazie: właściciel ustalany z usługi, wpis
 * OPERATOR_ACCOUNT_VIEWED z operatorem i klientem w dzienniku, a „Aktywność konta” klienta go nie pokazuje
 * (to odczyt obsługi, nie zmiana na koncie). Węzeł (DirectAdmin) zastąpiony atrapą.
 */
describe('PB-42 — podgląd konta klienta przez obsługę', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('odczyt PHP: dane konta z bazy, wpis w dzienniku, niewidoczny w aktywności klienta', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    await prisma().account.update({ where: { id: k.account.id }, data: { phpVersion: '8.3' } });
    const operator = await prisma().user.create({ data: { email: `obsluga-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });

    const audit = new AuditService(p);
    const php = new PhpService(p, audit, { getAvailablePhpVersions: async () => ['8.3', '8.2'] } as never);
    const da = {
      listHostingDomainsForSubscription: async () => ({ domains: [{ name: k.account.domain }], daUsername: null, primaryDomain: k.account.domain, fetchError: null }),
      getHostingPhpIni: async (_s: string, userId: string, domain: string) => {
        expect(userId).toBe(k.user.id);
        return { domain, values: { memory_limit: '512M' }, wlasneDyrektywy: 0 };
      },
    };
    const ctrl = new KontoKlientaAdminController(p, da as never, php, null as never, audit);

    const wynik = await ctrl.phpKonta(k.subscription.id, undefined, { userId: operator.id });
    expect(wynik).toMatchObject({ wersja: '8.3', domena: k.account.domain, ini: { memory_limit: '512M' }, iniBlad: null });

    const wpisy = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_VIEWED', userId: k.user.id } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatchObject({ actorUserId: operator.id, details: { subscriptionId: k.subscription.id, sekcja: 'php' } });

    const aktywnosc = await new UsersService(p, null as never, null as never, null as never, null as never, null as never).listMyActivity(k.user.id);
    expect(aktywnosc.events.map((e) => e.action)).not.toContain('OPERATOR_ACCOUNT_VIEWED');
  });

  it('nieistniejąca usługa → 404 i brak wpisu', async () => {
    const p = prisma() as never;
    const audit = new AuditService(p);
    const ctrl = new KontoKlientaAdminController(p, {} as never, {} as never, {} as never, audit);
    await expect(ctrl.bazy('00000000-0000-4000-8000-000000000000', { userId: 'x' })).rejects.toThrow('Usługa nie istnieje.');
    expect(await prisma().auditLog.count({ where: { action: 'OPERATOR_ACCOUNT_VIEWED', details: { path: ['subscriptionId'], equals: '00000000-0000-4000-8000-000000000000' } } })).toBe(0);
  });
});
