import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { renderVerrisTaskRunScript } from '../../src/servers/node-tasks-agent.install.js';
import { UslugiWezlaService } from '../../src/servers/uslugi-wezla.admin.controller.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F3.4 — usługi i logi węzła od zlecenia do wyniku na prawdziwej bazie (migracja 20261011210000: NodeTaskKind
 * NODE_SERVICES): zadanie w bazie, ten sam payload → env co agent węzła (mapowanie z node-tasks-agent.install.ts),
 * PRAWDZIWY ops/scripts/node-services.sh na atrapie systemctl, wynik przez NodeTasksService jak od agenta.
 * Log poczty: NOC widzi adresy zamaskowane — także wtedy, gdy log bez maski zamówił administrator.
 */
describe('F3.4 — usługi i logi węzła (zadanie NODE_SERVICES)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-services.sh');
  const MAPA = (() => {
    const m = /"\$TASK_KIND" = "NODE_SERVICES" \][\s\S]*?payload_env "SVC" "(\{[^"]+\})"/.exec(renderVerrisTaskRunScript());
    return JSON.parse(m![1].replace(/'/g, '"')) as Record<string, string>;
  })();

  function wezelZAtrapa() {
    const dir = mkdtempSync(join(tmpdir(), 'svc-int-'));
    writeFileSync(
      join(dir, 'jednostki.json'),
      JSON.stringify({
        'exim.service': { LoadState: 'loaded', ActiveState: 'active', SubState: 'running', ActiveEnterTimestampMonotonic: '1000000', NRestarts: '0' },
        'dovecot.service': { LoadState: 'loaded', ActiveState: 'failed', SubState: 'failed', ActiveEnterTimestampMonotonic: '0', NRestarts: '4' },
      }),
    );
    const bin = join(dir, 'systemctl');
    writeFileSync(
      bin,
      `#!/usr/bin/env python3
import json, sys
p = "${join(dir, 'jednostki.json')}"
j = json.load(open(p))
a = sys.argv[1:]
if a[0] == "show":
    u = j.get(a[1], {"LoadState": "not-found", "ActiveState": "inactive", "SubState": "dead"})
    for k in a[2].split("=", 1)[1].split(","):
        print("%s=%s" % (k, u.get(k, "")))
elif a[0] == "restart":
    j[a[1]]["ActiveState"] = "active"; j[a[1]]["SubState"] = "running"
    json.dump(j, open(p, "w"))
else:
    sys.exit(2)
`,
    );
    chmodSync(bin, 0o755);
    mkdirSync(join(dir, 'root', 'var', 'log', 'exim'), { recursive: true });
    writeFileSync(join(dir, 'root', 'var', 'log', 'exim', 'mainlog'), '2026-10-11 08:00:00 1abc <= jan@firma.pl\n2026-10-11 08:00:01 1abc ** ola@example.com R=lookuphost\n');
    writeFileSync(join(dir, 'uptime'), '5000.0 1.0\n');
    const uruchom = (payload: Record<string, unknown>) => {
      const env: Record<string, string> = {};
      for (const [src, dst] of Object.entries(MAPA)) if (payload[src] != null) env[`SVC_${dst}`] = String(payload[src]);
      const r = spawnSync('bash', [SKRYPT], {
        env: { PATH: process.env.PATH, TZ: 'UTC', SYSTEMCTL_BIN: bin, JOURNALCTL_BIN: '/bin/false', SVC_ROOT: join(dir, 'root'), SVC_UPTIME: join(dir, 'uptime'), ...env },
        encoding: 'utf8',
      });
      return { rc: r.status, log: r.stdout + r.stderr };
    };
    return { uruchom };
  }

  it('NOC: stan → uruchomienie stojącej usługi wspólnej (działającej — błąd węzła) → log poczty z maską; ADMIN bez maski, NOC nadal z maską', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const noc = await prisma().user.create({ data: { email: `noc-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const adm = await prisma().user.create({ data: { email: `adm-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const NOC = { userId: noc.id, role: 'STAFF' };
    const ADM = { userId: adm.id, role: 'ADMIN' };
    const audit = new AuditService(p);
    const svc = new UslugiWezlaService(p, audit);
    const zadania = new NodeTasksService(p, audit, {} as never);
    const atrapa = wezelZAtrapa();
    const agent = async () => {
      const t = await zadania.leaseTaskForNode(wezel.id);
      expect(t?.kind).toBe('NODE_SERVICES');
      const r = atrapa.uruchom(t!.payload as Record<string, unknown>);
      if (r.rc === 0) await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: r.log });
      else await zadania.failTaskFromNode({ serverId: wezel.id, taskId: t!.id, error: 'Skrypt zakończył się błędem', outputLog: r.log });
    };

    await svc.sprawdz(wezel.id, NOC);
    await agent();
    const stan = await svc.stan(wezel.id, NOC);
    expect(stan.uslugi!.lista.filter((u) => u.jednostka).map((u) => [u.klucz, u.stan])).toEqual([
      ['exim', 'dziala'],
      ['dovecot', 'blad'],
    ]);

    // Działający Exim: NOC zleca „uruchom” — węzeł odmawia (nie przerwiemy pracy kont), panel pokazuje błąd węzła.
    await svc.restart(wezel.id, NOC, 'exim', 'sprawdzam restart exima');
    await agent();
    expect((await svc.stan(wezel.id, NOC)).restart).toMatchObject({ usluga: 'exim', tylkoGdyStoi: true, blad: expect.stringContaining('usługa działa') });
    // Stojący Dovecot: NOC uruchamia.
    await svc.restart(wezel.id, NOC, 'dovecot', 'dovecot padł po aktualizacji');
    await agent();
    expect((await svc.stan(wezel.id, NOC)).restart).toMatchObject({ usluga: 'dovecot', blad: null, stanPo: 'dziala' });

    await svc.log(wezel.id, NOC, 'exim-main', 50, undefined);
    await agent();
    expect((await svc.stan(wezel.id, NOC)).log).toMatchObject({ klucz: 'exim-main', maska: true, linie: ['2026-10-11 08:00:00 1abc <= •••@firma.pl', '2026-10-11 08:00:01 1abc ** •••@example.com R=lookuphost'] });

    await svc.log(wezel.id, ADM, 'exim-main', 50, undefined);
    await agent();
    expect((await svc.stan(wezel.id, ADM)).log!.linie[0]).toContain('jan@firma.pl');
    const dlaNoc = await svc.stan(wezel.id, NOC);
    expect(dlaNoc.log!.linie[0]).toContain('•••@firma.pl');
    expect(JSON.stringify(dlaNoc)).not.toContain('jan@firma.pl');

    const wpisy = await prisma().auditLog.findMany({ where: { action: { in: ['NODE_SERVICES_CHECKED', 'NODE_SERVICE_RESTART_QUEUED', 'NODE_LOG_VIEWED'] } }, orderBy: { createdAt: 'asc' } });
    expect(wpisy.map((w) => w.action)).toEqual(['NODE_SERVICES_CHECKED', 'NODE_SERVICE_RESTART_QUEUED', 'NODE_SERVICE_RESTART_QUEUED', 'NODE_LOG_VIEWED', 'NODE_LOG_VIEWED']);
  });
});
