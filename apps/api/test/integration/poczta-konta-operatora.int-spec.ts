import { AuditService } from '../../src/common/audit/audit.service.js';
import { OutboundAbuseGuard } from '../../src/deliverability/outbound-abuse.guard.js';
import { AkcjeKontaOperatoraService } from '../../src/subscriptions/akcje-konta-operatora.service.js';
import { PocztaKontaOperatoraService } from '../../src/subscriptions/poczta-konta-operatora.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F3.1 (D4) — blokada wysyłki konta na prawdziwej bazie (migracja 20261011090000: Account.mailBlocked*): stan kto /
 * kiedy / powód, aktywność klienta „obsługa Verris (zgłoszenie #…)” bez dziennika zespołu, zwolnienie czyści stan.
 * Węzeł (lista blacklist_usernames DirectAdmina) zastąpiony atrapą.
 */
describe('F3.1 — blokada wysyłki konta przez obsługę', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('blokada i zwolnienie: stan w Account, aktywność klienta, dziennik zespołu z powodem', async () => {
    const p = prisma() as never;
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const operator = await prisma().user.create({ data: { email: `l3-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const zgl = await prisma().ticket.create({ data: { userId: k.user.id, subject: 'Poczta odbija się z RBL', message: 'x' } });
    const audit = new AuditService(p);
    const naWezle = new Set<string>();
    const da = {
      ustawBlokadeWysylki: async (_s: string, u: string, on: boolean) => {
        const zmieniono = naWezle.has(u) !== on;
        if (on) naWezle.add(u);
        else naWezle.delete(u);
        return { zmieniono };
      },
      blokadaWysylkiNaWezle: async (_s: string, u: string) => ({ obslugiwana: true, zablokowana: naWezle.has(u) }),
    };
    const akcje = new AkcjeKontaOperatoraService(p, da as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
    const kordon = new OutboundAbuseGuard({} as never, audit, { send: async () => ({ delivered: true }) } as never);
    const svc = new PocztaKontaOperatoraService(p, da as never, akcje, kordon);
    const z = { subscriptionId: k.subscription.id, operatorUserId: operator.id, operatorRole: 'STAFF', powod: 'Spam z formularza, IP na liście RBL', zgloszenie: `#${zgl.id.slice(0, 8)}` };

    await svc.zablokuj(z);
    const po = await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } });
    expect(po).toMatchObject({ mailBlockedById: operator.id, mailBlockedReason: 'Spam z formularza, IP na liście RBL' });
    expect(po.mailBlockedAt).toBeInstanceOf(Date);
    expect(naWezle.has(k.account.daUsername)).toBe(true);
    expect(await svc.stan(k.subscription.id)).toMatchObject({ zablokowana: true, przez: operator.email, naWezle: true });

    await svc.zwolnij({ ...z, powod: 'Klient usunął formularz, skan czysty' });
    expect(await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).toMatchObject({ mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null });
    expect(await kordon.isCordoned(k.user.id)).toBe(false);

    const aktywnosc = await new UsersService(p, null as never, null as never, null as never, null as never, null as never).listMyActivity(k.user.id);
    const kto = `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`;
    const widoczne = aktywnosc.events.map((e) => [e.action, e.actor]);
    expect(widoczne).toEqual(expect.arrayContaining([['HOSTING_MAIL_SENDING_BLOCKED', kto], ['HOSTING_MAIL_SENDING_UNBLOCKED', kto]]));
    expect(widoczne.map(([a]) => a)).not.toContain('OPERATOR_ACCOUNT_CHANGED');
    // Klient nie widzi powodu z dziennika zespołu (pisany dla zespołu) — tylko nazwę działania.
    expect(JSON.stringify(aktywnosc.events)).not.toContain('RBL');
    const zespol = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.user.id }, orderBy: { createdAt: 'asc' } });
    expect(zespol.map((w) => (w.details as Record<string, unknown>).akcja)).toEqual(['blokada-wysylki', 'zwolnienie-wysylki']);
  });
});
