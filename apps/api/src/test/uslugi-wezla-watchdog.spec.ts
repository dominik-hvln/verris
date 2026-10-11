import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { USLUGI_WATCHDOGA, uslugaNieDziala } from '@verris/contracts';
import { CloudLinuxTelemetryDto } from '../telemetry/telemetry.dto.js';
import { stanWatchdoga, uslugiNieDzialajaceFloty } from '../servers/uslugi-wezla.js';

/**
 * F3.4 — watchdog usług węzła: agent verris-lve (Python z heredoca, uruchomiony naprawdę na atrapie systemctl) raportuje
 * stan usług z białej listy panelu; API przyjmuje tylko klucze z listy; „nie działa” = failed albo inactive przy włączonym
 * autostarcie; metryka i panel — tylko aktywne węzły ze świeżym raportem.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '../../../../ops/scripts/verris-lve.sh'), 'utf8');
const PYTHON = (() => {
  const m = /python3 - <<'PYEOF'\n([\s\S]*?)\nPYEOF/.exec(SKRYPT);
  if (!m) throw new Error('brak heredoca PYEOF w verris-lve.sh');
  return m[1].replace(/\nmain\(\)\s*$/, '\n');
})();

function uslugiAgenta(jednostki: Record<string, Record<string, string>>, bezSystemctl = false): unknown {
  const kat = mkdtempSync(join(tmpdir(), 'verris-lve-svc-'));
  const bin = join(kat, 'systemctl');
  writeFileSync(
    bin,
    `#!/usr/bin/env python3
import json, sys
j = ${JSON.stringify(jednostki)}
a = sys.argv[1:]
open(sys.argv[0] + ".args", "a").write(" ".join(a) + "\\n")
u = j.get(a[1], {"LoadState": "not-found", "ActiveState": "inactive"})
for k in a[2].split("=", 1)[1].split(","):
    print("%s=%s" % (k, u.get(k, "")))
`,
  );
  chmodSync(bin, 0o755);
  const kod = `${PYTHON}\nSYSTEMCTL_BIN = ${JSON.stringify(bezSystemctl ? join(kat, 'nie-ma') : bin)}\nimport json as _j\nprint("WYNIK=" + _j.dumps(services_block()))\n`;
  const out = execFileSync('python3', ['-I', '-c', kod], {
    env: { PATH: process.env.PATH ?? '', VERRIS_API_URL: 'http://127.0.0.1:9', VERRIS_SERVER_ID: 's', VERRIS_IDENTITY_TOKEN: 't', LOG: join(kat, 'log') },
    encoding: 'utf8',
  });
  return JSON.parse(out.split('\n').find((l) => l.startsWith('WYNIK='))!.slice('WYNIK='.length));
}

describe('F3.4 — watchdog usług: agent verris-lve', () => {
  it('lista usług agenta = lista watchdoga panelu (klucze i jednostki)', () => {
    const blok = /WATCHDOG_USLUGI = \{([\s\S]*?)\n\}/.exec(SKRYPT)![1];
    const zAgenta = [...blok.matchAll(/^ {4}"([a-z0-9-]+)": \[([^\]]*)\],$/gm)].map((m) => ({ klucz: m[1], jednostki: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) }));
    expect(zAgenta).toEqual(USLUGI_WATCHDOGA.map((u) => ({ klucz: u.klucz, jednostki: [...u.jednostki] })));
  });

  it('pierwsza załadowana jednostka, ActiveState i UnitFileState; brak usługi na węźle — bez wpisu', () => {
    const w = uslugiAgenta({
      'mysqld.service': { LoadState: 'loaded', ActiveState: 'failed', UnitFileState: 'enabled' },
      'exim.service': { LoadState: 'loaded', ActiveState: 'active', UnitFileState: 'enabled' },
      'named.service': { LoadState: 'loaded', ActiveState: 'inactive', UnitFileState: 'disabled' },
    });
    expect(w).toEqual([
      { k: 'exim', s: 'active', e: 'enabled' },
      { k: 'mariadb', s: 'failed', e: 'enabled' },
      { k: 'named', s: 'inactive', e: 'disabled' },
    ]);
  });

  it('bez systemctl na węźle — brak bloku (None), nie „wszystko działa”', () => {
    expect(uslugiAgenta({}, true)).toBeNull();
  });
});

describe('F3.4 — watchdog usług: API', () => {
  const dto = (services: unknown) =>
    validateSync(plainToInstance(CloudLinuxTelemetryDto, { accounts: [], node: { services } }) as object, { whitelist: true, forbidNonWhitelisted: true });

  it('telemetria przyjmuje tylko klucze z listy i stany [a-z-]', () => {
    expect(dto([{ k: 'exim', s: 'failed', e: 'enabled' }])).toEqual([]);
    expect(dto([{ k: 'agent', s: 'failed' }]).length).toBeGreaterThan(0);
    expect(dto([{ k: 'exim', s: 'failed; rm' }]).length).toBeGreaterThan(0);
    expect(dto(Array.from({ length: 21 }, () => ({ k: 'exim', s: 'active' }))).length).toBeGreaterThan(0);
  });

  it('„nie działa”: failed albo inactive przy włączonym autostarcie; wyłączona celowo — nie', () => {
    expect(uslugaNieDziala({ s: 'failed' })).toBe(true);
    expect(uslugaNieDziala({ s: 'inactive', e: 'enabled' })).toBe(true);
    expect(uslugaNieDziala({ s: 'inactive', e: 'disabled' })).toBe(false);
    expect(uslugaNieDziala({ s: 'active', e: 'enabled' })).toBe(false);
    expect(uslugaNieDziala({ s: 'activating', e: 'enabled' })).toBe(false);
  });

  it('flota: tylko ACTIVE ze świeżym raportem (≤ 10 min); serwis i stary raport nie alarmują', () => {
    const teraz = Date.parse('2026-10-11T10:00:00Z');
    const raport = [{ k: 'exim', s: 'failed', e: 'enabled' }, { k: 'www', s: 'active', e: 'enabled' }];
    const w = (o: Record<string, unknown>) => ({ id: 'w', name: 'fra-01', status: 'ACTIVE', uslugiStan: raport, uslugiStanAt: new Date(teraz - 60_000), ...o });
    expect(uslugiNieDzialajaceFloty([w({})], teraz)).toEqual([{ serverId: 'w', wezel: 'fra-01', usluga: 'exim' }]);
    expect(uslugiNieDzialajaceFloty([w({ status: 'MAINTENANCE' })], teraz)).toEqual([]);
    expect(uslugiNieDzialajaceFloty([w({ uslugiStanAt: new Date(teraz - 11 * 60_000) })], teraz)).toEqual([]);
    expect(stanWatchdoga({ uslugiStan: raport, uslugiStanAt: new Date(teraz - 11 * 60_000) }, teraz)).toMatchObject({ swiezy: false, nieDzialaja: [] });
    expect(stanWatchdoga({ uslugiStan: null, uslugiStanAt: null }, teraz)).toMatchObject({ kiedy: null, swiezy: false });
    // Śmieci w JSON-ie z bazy nie przechodzą do panelu.
    expect(stanWatchdoga({ uslugiStan: [{ k: 'obca', s: 'failed' }, 'x', null], uslugiStanAt: new Date(teraz) }, teraz).uslugi).toEqual([]);
  });
});
