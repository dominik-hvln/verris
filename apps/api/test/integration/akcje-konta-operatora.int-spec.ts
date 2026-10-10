import { AuditService } from '../../src/common/audit/audit.service.js';
import { PhpService } from '../../src/subscriptions/php.service.js';
import { AkcjeKontaOperatoraService } from '../../src/subscriptions/akcje-konta-operatora.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F2.2 — pasek akcji konta na prawdziwej bazie: reset hasła skrzynki i zmiana PHP przez operatora. Klient widzi
 * w „Aktywności konta” „obsługa Verris (zgłoszenie #…)” (wpis serwisu z przepisanym autorem), nie widzi dziennika
 * zespołu z powodem; zadanie PHP_APPLY trafia do kolejki węzła. Węzeł (DirectAdmin) zastąpiony atrapą, która
 * zapisuje dziennik jak prawdziwa metoda (autor = właściciel).
 */
describe('F2.2 — akcje operatora na koncie klienta', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('reset hasła skrzynki i zmiana PHP: aktywność klienta „obsługa Verris (zgłoszenie #…)”, dziennik zespołu z powodem', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    const operator = await prisma().user.create({ data: { email: `l2-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const zgl = await prisma().ticket.create({ data: { userId: k.user.id, subject: 'Nie mogę się zalogować do poczty', message: 'x' } });

    const audit = new AuditService(p);
    const hasla: string[] = [];
    const da = {
      changeHostingEmailPassword: async (subscriptionId: string, userId: string, i: { email: string; password: string }) => {
        expect(userId).toBe(k.user.id);
        hasla.push(i.password);
        await audit.record({ action: 'HOSTING_EMAIL_PASSWORD_CHANGED', userId, actorUserId: userId, details: { subscriptionId, email: i.email } });
        return { ok: true as const };
      },
    };
    const php = new PhpService(p, audit, { getAvailablePhpVersions: async () => ['8.3', '8.2'] } as never);
    const maile: Array<{ to: string; text: string }> = [];
    const mailer = { send: async (m: { to: string; text: string }) => (maile.push(m), { delivered: true }) };
    const svc = new AkcjeKontaOperatoraService(
      p,
      da as never,
      php,
      null as never,
      audit,
      mailer as never,
      { get: () => 'https://panel.test' } as never,
      new ZawieszenieOperatoraService(p, null as never),
    );
    const zlecenie = { subscriptionId: k.subscription.id, operatorUserId: operator.id, powod: 'Klient dzwonił, nie pamięta hasła', zgloszenie: `#${zgl.id.slice(0, 8)}` };

    const skrzynka = `biuro@${k.account.domain}`;
    expect(await svc.resetHaslaSkrzynki(zlecenie, skrzynka)).toEqual({ ok: true, mailDoKlienta: true, klient: k.user.email });
    await svc.wersjaPhp(zlecenie, '8.2');

    // Zadanie PHP na węzeł: to samo co z panelu klienta.
    const zadanie = await prisma().nodeTask.findFirst({ where: { accountId: k.account.id, kind: 'PHP_APPLY' } });
    expect(zadanie).toMatchObject({ status: 'QUEUED', payload: expect.objectContaining({ version: '8.2' }) });

    const aktywnosc = await new UsersService(p, null as never, null as never, null as never, null as never, null as never).listMyActivity(k.user.id);
    const widoczne = aktywnosc.events.map((e) => [e.action, e.actor]);
    const kto = `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`;
    expect(widoczne).toEqual(expect.arrayContaining([['HOSTING_EMAIL_PASSWORD_CHANGED', kto], ['HOSTING_PHP_VERSION_CHANGED', kto]]));
    expect(widoczne.map(([a]) => a)).not.toContain('OPERATOR_ACCOUNT_CHANGED');

    const zespol = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.user.id }, orderBy: { createdAt: 'asc' } });
    expect(zespol.map((w) => [w.actorUserId, (w.details as Record<string, unknown>).akcja, (w.details as Record<string, unknown>).powod, (w.details as Record<string, unknown>).zgloszenieId])).toEqual([
      [operator.id, 'haslo-skrzynki', 'Klient dzwonił, nie pamięta hasła', zgl.id],
      [operator.id, 'php', 'Klient dzwonił, nie pamięta hasła', zgl.id],
    ]);

    // Hasła nie ma nigdzie w bazie ani w mailu.
    expect(hasla).toHaveLength(1);
    const wszystko = JSON.stringify(await prisma().auditLog.findMany()) + JSON.stringify(maile);
    expect(wszystko).not.toContain(hasla[0]);
    expect(maile[0].to).toBe(k.user.email);
  });
});
