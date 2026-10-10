import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { renderVerrisTaskRunScript } from '../../src/servers/node-tasks-agent.install.js';
import { BlokadyIpWezlaService } from '../../src/servers/blokady-ip-wezla.admin.controller.js';
import { AkcjeKontaOperatoraService } from '../../src/subscriptions/akcje-konta-operatora.service.js';
import { BlokadyIpKontaService } from '../../src/subscriptions/blokady-ip-konta.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F3.2 (D5) — „Zablokowało mi IP” od zlecenia do aktywności klienta, na prawdziwej bazie (migracja 20261011140000:
 * NodeTaskKind.IP_BLOCKS): adres ze zgłoszenia klienta, uprawnienia operatora z ról w bazie (L2: IP_UNBLOCK), zadanie
 * w bazie, ten sam payload → env co agent węzła (mapowanie z node-tasks-agent.install.ts), PRAWDZIWY
 * ops/scripts/node-ip-blocks.sh na atrapie fail2ban-client, wynik przez NodeTasksService jak od agenta.
 */
describe('F3.2 — blokady IP (zadanie IP_BLOCKS)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-ip-blocks.sh');
  const MAPA = (() => {
    const m = /"\$TASK_KIND" = "IP_BLOCKS" \][\s\S]*?payload_env "IPB" "(\{[^"]+\})"/.exec(renderVerrisTaskRunScript());
    return JSON.parse(m![1].replace(/'/g, '"')) as Record<string, string>;
  })();

  function wezelZAtrapa() {
    const dir = mkdtempSync(join(tmpdir(), 'ipb-int-'));
    const jailD = join(dir, 'jail.d');
    mkdirSync(jailD);
    writeFileSync(join(dir, 'bany'), '83.12.44.201|dovecot\n203.0.113.50|sshd\n');
    const bin = join(dir, 'fail2ban-client');
    writeFileSync(
      bin,
      `#!/usr/bin/env python3
import sys
p = "${join(dir, 'bany')}"
a = sys.argv[1:]
bany = [l.split("|") for l in open(p).read().splitlines() if l]
if a == ["status"]:
    print("Status\\n|- Number of jail:\\t2\\n\`- Jail list:\\tsshd, dovecot")
elif a[0] == "get":
    print("\\n".join("%s \\t2026-10-10 10:00:00 + 3600 = 2026-10-10 11:00:00" % ip for ip, j in bany if j == a[1]))
elif a[0] == "unban":
    zost = [b for b in bany if b[0] != a[1]]
    open(p, "w").write("".join("|".join(b) + "\\n" for b in zost))
    print(len(bany) - len(zost))
else:
    sys.exit(2)
`,
    );
    chmodSync(bin, 0o755);
    const uruchom = (payload: Record<string, unknown>) => {
      const env: Record<string, string> = {};
      for (const [src, dst] of Object.entries(MAPA)) if (payload[src] != null) env[`IPB_${dst}`] = String(payload[src]);
      const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, TZ: 'UTC', F2B_BIN: bin, IPB_JAIL_D: jailD, ...env }, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout;
    };
    return { uruchom };
  }

  it('L2: sprawdź adres ze zgłoszenia → odblokuj ze zgłoszeniem → węzeł zdejmuje blokadę; klient widzi „obsługa Verris (zgłoszenie #…)”', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    const rola = await prisma().staffRole.create({ data: { name: `L2 test ${Date.now()}`, permissions: ['IP_UNBLOCK'] } });
    const l2 = await prisma().user.create({ data: { email: `l2-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: rola.id } });
    const zgl = await prisma().ticket.create({ data: { userId: k.user.id, subject: 'Nie odbieram poczty', message: 'Od rana nie mogę odebrać poczty. Mój adres IP: 83.12.44.201' } });
    const audit = new AuditService(p);
    const akcje = new AkcjeKontaOperatoraService(p, null as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
    const svc = new BlokadyIpKontaService(p, audit, akcje, new BlokadyIpWezlaService(p, audit));
    const zadania = new NodeTasksService(p, audit, {} as never);
    const atrapa = wezelZAtrapa();
    const agent = async () => {
      const t = await zadania.leaseTaskForNode(wezel.id);
      expect(t?.kind).toBe('IP_BLOCKS');
      await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: atrapa.uruchom(t!.payload as Record<string, unknown>) });
    };

    const start = await svc.stan(k.subscription.id, l2.id);
    expect(start.adresy).toEqual([expect.objectContaining({ ip: '83.12.44.201', zrodla: ['zgloszenie'], zgloszenia: [zgl.id] })]);

    // L2 nie sprawdzi cudzego adresu (blokada innego klienta węzła).
    await expect(svc.sprawdz(k.subscription.id, l2.id, 'STAFF', '203.0.113.50')).rejects.toMatchObject({ status: 403 });
    expect((await svc.sprawdz(k.subscription.id, l2.id, 'STAFF', '83.12.44.201')).wToku).toBe(true);
    await agent();
    const sprawdzone = await svc.stan(k.subscription.id, l2.id);
    expect(sprawdzone.sprawdzenie).toMatchObject({ ip: '83.12.44.201', wToku: false, blokady: [{ ip: '83.12.44.201', jail: 'dovecot', powod: 'nieudane logowania IMAP/POP3 (odbiór poczty)' }] });
    expect(JSON.stringify(sprawdzone)).not.toContain('203.0.113.50');

    const z = { subscriptionId: k.subscription.id, operatorUserId: l2.id, operatorRole: 'STAFF', powod: 'Klient zgłasza brak odbioru poczty po zmianie hasła' };
    await expect(svc.odblokuj(z, '83.12.44.201')).rejects.toMatchObject({ status: 400 });
    expect(await svc.odblokuj({ ...z, zgloszenie: `#${zgl.id.slice(0, 8)}` }, '83.12.44.201')).toMatchObject({ ok: true });
    await agent();
    const po = await svc.stan(k.subscription.id, l2.id);
    expect(po.operacja).toMatchObject({ tryb: 'unban', ip: '83.12.44.201', wToku: false, odblokowano: 1, blad: null });
    // Pełna lista węzła po operacji nie trafia na kartę usługi (L2).
    expect(JSON.stringify(po)).not.toContain('203.0.113.50');

    const aktywnosc = await new UsersService(p, null as never, null as never, null as never, null as never, null as never).listMyActivity(k.user.id);
    expect(aktywnosc.events.map((e) => [e.action, e.actor, e.context])).toEqual(
      expect.arrayContaining([['HOSTING_IP_UNBLOCK_QUEUED', `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`, '83.12.44.201']]),
    );
    expect(JSON.stringify(aktywnosc.events)).not.toMatch(/fail2ban|dovecot|jail/i);
    const zespol = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.user.id }, orderBy: { createdAt: 'asc' } });
    expect(zespol.map((w) => [(w.details as Record<string, unknown>).akcja, (w.details as Record<string, unknown>).wynik])).toEqual([
      ['odblokowanie-ip', 'blad'],
      ['odblokowanie-ip', 'ok'],
    ]);
  });
});
