import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { renderVerrisTaskRunScript } from '../../src/servers/node-tasks-agent.install.js';
import { OutboundAbuseGuard } from '../../src/deliverability/outbound-abuse.guard.js';
import { AkcjeKontaOperatoraService } from '../../src/subscriptions/akcje-konta-operatora.service.js';
import { PocztaKontaOperatoraService } from '../../src/subscriptions/poczta-konta-operatora.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { PocztaWezlaService } from '../../src/servers/poczta-wezla.admin.controller.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

const SKRYPTY = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts');
/** Mapowanie payload → env z renderu agenta (to samo, co dostaje węzeł). */
const mapa = (kind: string, pfx: string) => {
  const m = new RegExp(`"\\$TASK_KIND" = "${kind}" \\][\\s\\S]*?payload_env "${pfx}" "(\\{[^"]+\\})"`).exec(renderVerrisTaskRunScript());
  return JSON.parse(m![1].replace(/'/g, '"')) as Record<string, string>;
};
const env = (payload: Record<string, unknown>, kind: string, pfx: string) => {
  const out: Record<string, string> = {};
  for (const [src, dst] of Object.entries(mapa(kind, pfx))) if (payload[src] != null) out[`${pfx}_${dst}`] = String(payload[src]);
  return out;
};

/**
 * F3.1 reszta na prawdziwej bazie (migracja 20261011170000: Account.mailSendLimit): limit wysyłki konta od zlecenia
 * L3 przez mapowanie agenta i PRAWDZIWY node-mail-queue.sh (katalog /etc/virtual podmieniony) do potwierdzenia przez
 * NodeTasksService — dopiero wtedy wartość w bazie i w panelu klienta; statystyki poczty węzła (node-mail-log.sh stats)
 * dopasowane do kont węzła.
 */
describe('F3.1 — limit wysyłki konta i statystyki poczty węzła', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('limit: zlecenie z powodem → węzeł zapisuje plik → baza i aktywność klienta; powrót do domyślnego', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    const operator = await prisma().user.create({ data: { email: `l3l-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const audit = new AuditService(p);
    const akcje = new AkcjeKontaOperatoraService(p, {} as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
    const svc = new PocztaKontaOperatoraService(p, {} as never, akcje, new OutboundAbuseGuard({} as never, audit, { send: async () => ({}) } as never), audit);
    const zadania = new NodeTasksService(p, audit, {} as never);
    const dir = mkdtempSync(join(tmpdir(), 'limit-int-'));
    mkdirSync(join(dir, 'virtual'));
    writeFileSync(join(dir, 'virtual', 'limit'), '1000\n');
    mkdirSync(join(dir, 'users', k.account.daUsername), { recursive: true });
    writeFileSync(join(dir, 'users', k.account.daUsername, 'user.conf'), 'usertype=user\n');
    const agent = async () => {
      const t = await zadania.leaseTaskForNode(wezel.id);
      expect(t?.kind).toBe('MAIL_QUEUE');
      const r = spawnSync('bash', [join(SKRYPTY, 'node-mail-queue.sh')], {
        env: { PATH: process.env.PATH, MQ_VIRTUAL_DIR: join(dir, 'virtual'), MQ_DA_USERS: join(dir, 'users'), ...env(t!.payload as Record<string, unknown>, 'MAIL_QUEUE', 'MQ') },
        encoding: 'utf8',
      });
      expect(r.status, r.stderr).toBe(0);
      await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: r.stdout });
    };
    const z = { subscriptionId: k.subscription.id, operatorUserId: operator.id, operatorRole: 'STAFF', powod: 'Kampania klienta po rozmowie, limit tymczasowy' };

    await expect(svc.ustawLimit({ ...z, powod: 'krótko' }, 300)).rejects.toMatchObject({ status: 400 });
    await expect(svc.ustawLimit(z, 0)).rejects.toMatchObject({ status: 400 });
    await svc.ustawLimit(z, 300);
    // Do potwierdzenia węzła baza (i panel klienta) pokazuje stary limit.
    expect(await svc.limit(k.subscription.id, 'ADMIN')).toMatchObject({ limitKonta: null, obowiazuje: 1000, wToku: true });
    await expect(svc.ustawLimit(z, 400)).rejects.toMatchObject({ status: 409 });
    await agent();
    expect(readFileSync(join(dir, 'virtual', `limit_${k.account.daUsername}`), 'utf8')).toBe('300');
    expect(await svc.limit(k.subscription.id, 'ADMIN')).toMatchObject({ limitKonta: 300, obowiazuje: 300, wToku: false, wynik: { limit: 300, domyslny: 1000 } });
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).mailSendLimit).toBe(300);

    // Kolejka konta nie widzi zadań limitu.
    expect((await svc.kolejka(k.subscription.id, operator.id)).wczytano).toBeNull();

    await svc.ustawLimit({ ...z, powod: 'Koniec kampanii, wracamy do domyślnego' }, null);
    await agent();
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).mailSendLimit).toBeNull();

    const aktywnosc = await new UsersService(p, null as never, null as never, null as never, null as never, null as never).listMyActivity(k.user.id);
    expect(aktywnosc.events.filter((e) => e.action === 'HOSTING_MAIL_SEND_LIMIT_CHANGE_QUEUED').map((e) => e.actor)).toEqual(['obsługa Verris', 'obsługa Verris']);
    expect(aktywnosc.events.map((e) => e.action)).not.toContain('MAIL_SEND_LIMIT_CONFIRMED');
    const zespol = await prisma().auditLog.findMany({ where: { action: 'MAIL_SEND_LIMIT_CONFIRMED' }, orderBy: { createdAt: 'asc' } });
    expect(zespol.map((w) => [(w.details as Record<string, unknown>).przed, (w.details as Record<string, unknown>).po])).toEqual([[null, 300], [300, null]]);
  });

  it('przegląd: agent sprzed aktualizacji (bez MQ_LIMIT) — skrypt tylko czyta, zadanie FAILED, baza bez zmian', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    const operator = await prisma().user.create({ data: { email: `l3s-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const audit = new AuditService(p);
    const akcje = new AkcjeKontaOperatoraService(p, {} as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
    const svc = new PocztaKontaOperatoraService(p, {} as never, akcje, new OutboundAbuseGuard({} as never, audit, { send: async () => ({}) } as never), audit);
    const zadania = new NodeTasksService(p, audit, {} as never);
    const dir = mkdtempSync(join(tmpdir(), 'limit-stary-'));
    mkdirSync(join(dir, 'virtual'));
    writeFileSync(join(dir, 'virtual', 'limit'), '1000\n');
    mkdirSync(join(dir, 'users', k.account.daUsername), { recursive: true });
    writeFileSync(join(dir, 'users', k.account.daUsername, 'user.conf'), 'usertype=user\n');

    await svc.ustawLimit({ subscriptionId: k.subscription.id, operatorUserId: operator.id, operatorRole: 'STAFF', powod: 'Kampania klienta po rozmowie, limit tymczasowy' }, 300);
    const t = await zadania.leaseTaskForNode(wezel.id);
    // Stary agent: mapowanie bez 'limit' → skrypt dostaje tylko tryb i użytkownika (odczyt) i kończy się zerem.
    const { limit: _pominiety, ...bezLimitu } = t!.payload as Record<string, unknown>;
    const r = spawnSync('bash', [join(SKRYPTY, 'node-mail-queue.sh')], {
      env: { PATH: process.env.PATH, MQ_VIRTUAL_DIR: join(dir, 'virtual'), MQ_DA_USERS: join(dir, 'users'), ...env(bezLimitu, 'MAIL_QUEUE', 'MQ') },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`VERRIS_MQ_LIMIT ${k.account.daUsername} domyslny 1000`);
    await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: r.stdout });

    expect((await prisma().nodeTask.findUniqueOrThrow({ where: { id: t!.id } })).status).toBe('FAILED');
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).mailSendLimit).toBeNull();
    const stan = await svc.limit(k.subscription.id, 'ADMIN');
    expect(stan).toMatchObject({ limitKonta: null, obowiazuje: 1000, wToku: false });
    expect(stan.blad).toMatch(/nie potwierdził nowego limitu/);
    expect(await prisma().auditLog.count({ where: { action: 'MAIL_SEND_LIMIT_CONFIRMED' } })).toBe(0);
  });

  it('limit na usłudze konta zespołu: STAFF dostaje 403 (odczyt, wczytanie, zmiana), ADMIN czyta — styk poprawek Fal 2 z F3.1', async () => {
    const p = prisma() as never;
    const audit = { record: async () => undefined } as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    await prisma().user.update({ where: { id: k.subscription.userId }, data: { role: 'STAFF' } });
    const operator = await prisma().user.create({ data: { email: `l3z-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const akcje = new AkcjeKontaOperatoraService(p, {} as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
    const svc = new PocztaKontaOperatoraService(p, {} as never, akcje, new OutboundAbuseGuard({} as never, audit, { send: async () => ({}) } as never), audit);

    await expect(svc.limit(k.subscription.id, 'STAFF')).rejects.toMatchObject({ status: 403 });
    await expect(svc.wczytajLimit(k.subscription.id, operator.id, 'STAFF')).rejects.toMatchObject({ status: 403 });
    await expect(svc.ustawLimit({ subscriptionId: k.subscription.id, operatorUserId: operator.id, operatorRole: 'STAFF', powod: 'Próba zmiany limitu konta zespołu' }, 300)).rejects.toMatchObject({ status: 403 });
    expect(await prisma().nodeTask.count({ where: { accountId: k.account.id } })).toBe(0);
    expect(await svc.limit(k.subscription.id, 'ADMIN')).toMatchObject({ limitKonta: null });
  });

  it('statystyki węzła: zadanie MAIL_LOG bez konta → agregat dopasowany do kont węzła; konto innego węzła bez linku', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const inny = await utworzWezel();
    const plan = await utworzPlan();
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    const obce = await utworzKonto({ serverId: inny.id, planId: plan.id });
    const noc = await prisma().user.create({ data: { email: `noc-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const audit = new AuditService(p);
    const svc = new PocztaWezlaService(p, audit);
    const zadania = new NodeTasksService(p, audit, {} as never);
    const dir = mkdtempSync(join(tmpdir(), 'stats-int-'));
    writeFileSync(
      join(dir, 'mainlog'),
      [
        `2026-10-10 10:00:00 1tAAAA-00000000001-AAAA <= x@${k.account.domain} U=${k.account.daUsername} P=local S=1`,
        '2026-10-10 10:00:01 1tAAAA-00000000001-AAAA => a@gmail.com R=lookuphost T=remote_smtp H=gmail-smtp-in.l.google.com [1.1.1.1]',
        `2026-10-10 10:01:00 1tAAAA-00000000002-AAAA <= y@${obce.account.domain} H=(x) [10.0.0.1] A=dovecot_login:y@${obce.account.domain} S=1`,
        '2026-10-10 10:01:01 1tAAAA-00000000002-AAAA ** b@wp.pl R=lookuphost T=remote_smtp H=mx.wp.pl [2.2.2.2]: 550 5.7.1 rejected',
      ].join('\n') + '\n',
    );

    await svc.wczytajStatystyki(wezel.id, noc.id);
    await expect(svc.wczytajStatystyki(wezel.id, noc.id)).rejects.toMatchObject({ status: 409 });
    const t = await zadania.leaseTaskForNode(wezel.id);
    expect(t).toMatchObject({ kind: 'MAIL_LOG' });
    expect((await prisma().nodeTask.findUniqueOrThrow({ where: { id: t!.id } })).accountId).toBeNull();
    const r = spawnSync('bash', [join(SKRYPTY, 'node-mail-log.sh')], { env: { PATH: process.env.PATH, ML_LOG_DIR: dir, ...env(t!.payload as Record<string, unknown>, 'MAIL_LOG', 'ML') }, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: r.stdout });

    const s = await svc.statystyki(wezel.id, noc.id);
    expect(s.wynik!.nadawcy).toEqual([
      { domena: k.account.domain, uzytkownik: k.account.daUsername, wiadomosci: 1, odrzucone: 0, opoznione: 0, konto: { subscriptionId: k.subscription.id, domena: k.account.domain, login: k.account.daUsername } },
      { domena: obce.account.domain, uzytkownik: null, wiadomosci: 1, odrzucone: 1, opoznione: 0, konto: null },
    ]);
    expect(s.wynik!.odrzucenia).toEqual([{ kod: '550', serwer: 'wp.pl', liczba: 1 }]);
    expect(await prisma().auditLog.count({ where: { action: 'NODE_MAIL_STATS_VIEWED', actorUserId: noc.id } })).toBeGreaterThanOrEqual(2);

    // RBL na żądanie: atrapa DNS, wynik per strefa, wpis w dzienniku.
    await prisma().server.update({ where: { id: wezel.id }, data: { ipAddress: '203.0.113.7' } });
    const rbl = await svc.rbl(wezel.id, noc.id, async () => ({ listed: ['bl.spamcop.net'], unknown: ['b.barracudacentral.org'] }));
    expect(rbl).toMatchObject({ ip: '203.0.113.7', naLiscie: ['bl.spamcop.net'], nieznane: ['b.barracudacentral.org'], czyste: ['zen.spamhaus.org'] });
    expect(await prisma().auditLog.count({ where: { action: 'NODE_RBL_CHECKED' } })).toBe(1);
  });
});
