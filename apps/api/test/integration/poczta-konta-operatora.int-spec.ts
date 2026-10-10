import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { renderVerrisTaskRunScript } from '../../src/servers/node-tasks-agent.install.js';
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
    const svc = new PocztaKontaOperatoraService(p, da as never, akcje, kordon, audit);
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

/**
 * F3.1 — kolejka konta od zlecenia do dziennika: zadanie MAIL_QUEUE w bazie, ten sam payload → env co agent węzła
 * (mapowanie z node-tasks-agent.install.ts), PRAWDZIWY ops/scripts/node-mail-queue.sh na atrapie exima, wynik przez
 * NodeTasksService jak od agenta. Odpowiedź API ma tylko nagłówki; usunięcie — tylko z podglądu, liczba w dzienniku.
 */
describe('F3.1 — kolejka poczty konta (zadanie MAIL_QUEUE)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-mail-queue.sh');
  const MAPA = (() => {
    const m = /"\$TASK_KIND" = "MAIL_QUEUE" \][\s\S]*?payload_env "MQ" "(\{[^"]+\})"/.exec(renderVerrisTaskRunScript());
    return JSON.parse(m![1].replace(/'/g, '"')) as Record<string, string>;
  })();

  function wezelZAtrapa(daUser: string) {
    const dir = mkdtempSync(join(tmpdir(), 'mq-int-'));
    const k = join(dir, 'k');
    mkdirSync(k);
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'exim'),
      `#!/bin/bash\nK="${k}"\ncase "$1" in\n -bpc) ls "$K" | grep -c '\\.bp$' || true ;;\n -bp) cat "$K"/*.bp 2>/dev/null; true ;;\n` +
        ` -Mvh) [ -f "$K/$2-H" ] || exit 1; cat "$K/$2-H" ;;\n -Mrm) shift; for i in "$@"; do rm -f "$K/$i-H" "$K/$i.bp" && echo "Message $i has been removed"; done ;;\n *) exit 2 ;;\nesac\n`,
    );
    chmodSync(join(bin, 'exim'), 0o755);
    const msg = (id: string, login: string, nadawca: string, temat: string) => {
      writeFileSync(join(k, `${id}.bp`), ` 3m  1.2K ${id} <${nadawca}>\n          ofiara@gmail.com\n\n`);
      writeFileSync(join(k, `${id}-H`), `${id}-H\n${login} 1001 1001\n<${nadawca}>\n1760090000 0\nXX\n1\nofiara@gmail.com\n\n030  Subject: ${temat}\n`);
    };
    msg('1tAbCd-000000001bo-D342', daUser, `${daUser}@t1.verris.test`, 'Viagra tanio');
    msg('1tZzZz-0000000aaaa-0001', 'innyuser', 'inny@obcy.pl', 'Obca wiadomosc');
    /** Agent: payload → env MQ_* (mapowanie agenta), uruchomienie skryptu, log jak w verris-task-run.sh. */
    const uruchom = (payload: Record<string, unknown>) => {
      const env: Record<string, string> = {};
      for (const [src, dst] of Object.entries(MAPA)) if (payload[src] != null) env[`MQ_${dst}`] = String(payload[src]);
      const r = spawnSync('bash', [SKRYPT], { env: { PATH: `${bin}:${process.env.PATH}`, ...env }, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout;
    };
    return { uruchom };
  }

  it('podgląd tylko wiadomości konta (nagłówki), usunięcie z podglądu, liczba usuniętych w dzienniku zespołu', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    const operator = await prisma().user.create({ data: { email: `l3q-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const audit = new AuditService(p);
    const da = { listHostingDomainsForSubscription: async () => ({ domains: [{ name: k.account.domain }], daUsername: k.account.daUsername, primaryDomain: k.account.domain, fetchError: null }) };
    const akcje = new AkcjeKontaOperatoraService(p, da as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
    const svc = new PocztaKontaOperatoraService(p, da as never, akcje, new OutboundAbuseGuard({} as never, audit, { send: async () => ({}) } as never), audit);
    const zadania = new NodeTasksService(p, audit, {} as never);
    const atrapa = wezelZAtrapa(k.account.daUsername);
    const agent = async () => {
      const t = await zadania.leaseTaskForNode(wezel.id);
      expect(t?.kind).toBe('MAIL_QUEUE');
      await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: atrapa.uruchom(t!.payload as Record<string, unknown>) });
    };

    expect((await svc.wczytajKolejke(k.subscription.id, operator.id)).wToku).toBe(true);
    await expect(svc.wczytajKolejke(k.subscription.id, operator.id)).rejects.toMatchObject({ status: 409 });
    await agent();
    const stan = await svc.kolejka(k.subscription.id, operator.id);
    expect(stan.wiadomosci).toEqual([
      { id: '1tAbCd-000000001bo-D342', wiek: '3m', rozmiar: '1.2K', zamrozona: false, nadawca: `${k.account.daUsername}@t1.verris.test`, odbiorcy: 'ofiara@gmail.com', temat: 'Viagra tanio' },
    ]);
    expect(Object.keys(stan.wiadomosci[0]!).sort()).toEqual(['id', 'nadawca', 'odbiorcy', 'rozmiar', 'temat', 'wiek', 'zamrozona']);

    const z = { subscriptionId: k.subscription.id, operatorUserId: operator.id, operatorRole: 'STAFF', powod: 'Spam z przejętego formularza kontaktowego' };
    // Cudza wiadomość (spoza podglądu konta) — odmowa, bez zadania.
    await expect(svc.usunZKolejki(z, ['1tZzZz-0000000aaaa-0001'])).rejects.toMatchObject({ status: 400 });
    expect(await svc.usunZKolejki(z, ['1tAbCd-000000001bo-D342'])).toMatchObject({ ok: true, zlecono: 1 });
    await agent();

    const usuniete = await prisma().auditLog.findFirstOrThrow({ where: { action: 'MAIL_QUEUE_MESSAGES_REMOVED' } });
    expect(usuniete).toMatchObject({ userId: k.user.id, actorUserId: operator.id });
    expect(usuniete.details).toMatchObject({ usunieto: 1, pominieto: 0, subscriptionId: k.subscription.id });
    expect((await svc.kolejka(k.subscription.id, operator.id)).usuwanie).toMatchObject({ wToku: false, usunieto: 1 });
    // Odmowa też jest w dzienniku zespołu (wynik „blad”) — operator próbował usunąć cudzą wiadomość.
    const zespol = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.user.id }, orderBy: { createdAt: 'asc' } });
    expect(zespol.map((w) => [(w.details as Record<string, unknown>).akcja, (w.details as Record<string, unknown>).wynik])).toEqual([
      ['kolejka-usun', 'blad'],
      ['kolejka-usun', 'ok'],
    ]);
    expect(await prisma().auditLog.count({ where: { action: 'HOSTING_MAIL_QUEUE_PURGE_QUEUED', userId: k.user.id, actorUserId: operator.id } })).toBe(1);
  });
});
