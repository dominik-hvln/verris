import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { renderVerrisTaskRunScript } from '../../src/servers/node-tasks-agent.install.js';
import { TrafieniaWafKontaService } from '../../src/subscriptions/trafienia-waf-konta.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F3.2 — trafienia WAF konta od zlecenia do karty usługi na prawdziwej bazie (migracja 20261011150000:
 * NodeTaskKind.WAF_HITS): zadanie w bazie, payload → env z renderu agenta, PRAWDZIWY ops/scripts/node-waf-hits.sh na
 * próbce dziennika audytu ModSecurity, wynik przez NodeTasksService jak od agenta; tylko domeny konta.
 */
describe('F3.2 — trafienia WAF (zadanie WAF_HITS)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-waf-hits.sh');
  const MAPA = (() => {
    const m = /"\$TASK_KIND" = "WAF_HITS" \][\s\S]*?payload_env "WH" "(\{[^"]+\})"/.exec(renderVerrisTaskRunScript());
    return JSON.parse(m![1].replace(/'/g, '"')) as Record<string, string>;
  })();

  it('wczytaj → węzeł czyta dziennik → karta usługi: trafienia domeny konta, reguła, zablokowano; obce domeny pominięte', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    const operator = await prisma().user.create({ data: { email: `l2w-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const d = k.account.domain;
    const da = { listHostingDomainsForSubscription: async () => ({ domains: [{ name: d }] }) };
    const svc = new TrafieniaWafKontaService(p, da as never);
    const zadania = new NodeTasksService(p, new AuditService(p), {} as never);
    const wpis = (g: string, host: string, id: string) =>
      `--${g}-A--\n[10/Oct/2026:12:00:00.000001 +0200] X 198.51.100.23 1 10.0.0.5 443\n--${g}-B--\nGET /wp-login.php?log=admin HTTP/1.1\nHost: ${host}\n\n--${g}-F--\nHTTP/1.1 403 Forbidden\n\n--${g}-H--\nMessage: Access denied [id "${id}"] [msg "Reguła ${id}"]\nAction: Intercepted (phase 2)\n\n--${g}-Z--\n`;
    const dir = mkdtempSync(join(tmpdir(), 'waf-int-'));
    writeFileSync(join(dir, 'modsec_audit.log'), wpis('aaaa1111', `www.${d}`, '941100') + wpis('bbbb2222', 'obcy-klient.pl', '942100'));

    expect((await svc.wczytaj(k.subscription.id, k.user.id, operator.id)).wToku).toBe(true);
    const t = await zadania.leaseTaskForNode(wezel.id);
    expect(t?.kind).toBe('WAF_HITS');
    const env: Record<string, string> = {};
    for (const [src, dst] of Object.entries(MAPA)) {
      const v = (t!.payload as Record<string, unknown>)[src];
      if (v != null) env[`WH_${dst}`] = String(v);
    }
    const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, MODSEC_AUDIT_LOG: join(dir, 'modsec_audit.log'), ...env }, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    await zadania.completeTaskFromNode({ serverId: wezel.id, taskId: t!.id, outputLog: r.stdout });

    const w = await svc.widok(k.subscription.id);
    expect(w).toMatchObject({ wToku: false, razem: 1, blad: null, tryb: k.account.wafMode });
    expect(w.trafienia).toEqual([
      { czas: '2026-10-10T10:00:00Z', domena: d, ip: '198.51.100.23', metoda: 'GET', sciezka: '/wp-login.php', regula: '941100', opis: 'Reguła 941100', zablokowano: true, status: '403' },
    ]);
    expect(JSON.stringify(w)).not.toContain('obcy-klient.pl');
  });
});
