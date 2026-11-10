import { spawnSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Incydent 10.11.2026 — dysk serwera panelu (75 GB) zapełniony w 99%.
 *
 *   1. prod-deploy-ghcr.sh robił przy KAŻDYM deployu kopię danych Grafany
 *      (~180 MB) do /var/lib/verris/backups i nigdy jej nie usuwał: 217 kopii, 34 GB;
 *   2. dziennik systemd 3,7 GB (limit tylko ręcznie na serwerze);
 *   3. ~3 GB nieużywanych obrazów;
 *   i ani jednego alarmu o dysku hosta, choć node_exporter zbierał dane od początku.
 *
 * Ten plik uruchamia PRAWDZIWĄ logikę z ops/scripts/lib/miejsce-na-dysku.sh
 * w bashu, z tymi samymi flagami co skrypty wdrożeniowe (`set -Eeuo pipefail`),
 * a dla poleceń systemowych (df, docker, systemctl, journalctl) podstawia atrapy
 * w PATH. Tam, gdzie chodzi o to, CZY skrypt woła logikę, sprawdzamy kolejność
 * w kodzie bez komentarzy (lekcja X-28: komentarz nie jest kodem).
 *
 * CZEGO TEN TEST NIE DOWODZI: że na produkcji jest dobrze. To pokaże dopiero
 * deploy (`[dysk] wolne na /…`, „kopia Grafany pominięta") i `df -h /` na serwerze.
 */

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const LIB = join(KORZEN, 'ops', 'scripts', 'lib', 'miejsce-na-dysku.sh');
const TERAZ = Math.floor(Date.UTC(2026, 10, 10, 12, 0, 0) / 1000); // 2026-11-10 12:00 UTC

/** Treść bez komentarzy powłoki/YAML. */
function kod(sciezka: string): string {
  return readFileSync(join(KORZEN, sciezka), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

interface Wynik {
  kod: number | null;
  stdout: string;
  stderr: string;
}

/** Uruchamia fragment bashu z załadowaną biblioteką, z flagami produkcji. */
function bash(skrypt: string, env: Record<string, string> = {}, bin?: string): Wynik {
  const r = spawnSync('bash', ['-c', `set -Eeuo pipefail; . "${LIB}"; ${skrypt}`], {
    encoding: 'utf8',
    env: {
      PATH: `${bin ? bin + ':' : ''}${process.env.PATH ?? '/usr/bin:/bin'}`,
      TZ: 'UTC',
      ...env,
    },
  });
  return { kod: r.status, stdout: r.stdout, stderr: r.stderr };
}

function atrapa(bin: string, nazwa: string, tresc: string) {
  const p = join(bin, nazwa);
  writeFileSync(p, `#!/usr/bin/env bash\n${tresc}\n`);
  chmodSync(p, 0o755);
}

function katalogTymczasowy(prefiks: string): string {
  return mkdtempSync(join(tmpdir(), prefiks));
}

// ─────────────────────────────────────────────────────────────────────────────
describe('retencja kopii lokalnych (przytnij_kopie_lokalne)', () => {
  function przygotuj(): string {
    const kat = katalogTymczasowy('kopie-');
    for (const d of ['20261110-080000', '20261109-080000', '20261101-080000', '20261020-080000', '20260901-080000', '20260801-080000']) {
      writeFileSync(join(kat, `grafana-${d}.tgz`), 'x');
    }
    writeFileSync(join(kat, 'grafana-reczna.tgz'), 'nie ruszać');
    for (const d of ['20261109-100000', '20261020-000000', '20261015-000000', '20261001-000000', '20260901-000000', '20260801-000000']) {
      mkdirSync(join(kat, `infra-${d}`));
      writeFileSync(join(kat, `infra-${d}`, 'verris_db.dump'), 'dane');
      writeFileSync(join(kat, `infra-${d}`, 'role.sql'), 'role');
    }
    mkdirSync(join(kat, 'infra-reczne'));
    writeFileSync(join(kat, 'notatki.txt'), 'nie ruszać');
    const stara = join(kat, 'grafana-20261110-070000.tgz.partial');
    writeFileSync(stara, 'urwana');
    utimesSync(stara, new Date(Date.now() - 2 * 3600_000), new Date(Date.now() - 2 * 3600_000));
    writeFileSync(join(kat, 'grafana-20261110-115900.tgz.partial'), 'właśnie powstaje');
    return kat;
  }

  it('Grafana: zostają 3 najnowsze, nazwy spoza wzorca nietknięte, stare .partial usunięte', () => {
    const kat = przygotuj();
    const r = bash(`przytnij_kopie_lokalne "${kat}"`, { PRZYTNIJ_TERAZ: String(TERAZ) });
    expect(r.kod).toBe(0);
    const grafana = readdirSync(kat).filter((n) => n.startsWith('grafana-')).sort();
    expect(grafana).toEqual([
      'grafana-20261101-080000.tgz',
      'grafana-20261109-080000.tgz',
      'grafana-20261110-080000.tgz',
      'grafana-20261110-115900.tgz.partial',
      'grafana-reczna.tgz',
    ]);
  });

  it('infra-*: usuwa tylko starsze niż 30 dni I spoza 2 najnowszych', () => {
    const kat = przygotuj();
    expect(bash(`przytnij_kopie_lokalne "${kat}"`, { PRZYTNIJ_TERAZ: String(TERAZ) }).kod).toBe(0);
    const infra = readdirSync(kat).filter((n) => n.startsWith('infra-')).sort();
    // 1109 i 1020 — dwa najnowsze; 1015 — trzeci, ale młodszy niż 30 dni; ręczny katalog zostaje.
    expect(infra).toEqual(['infra-20261015-000000', 'infra-20261020-000000', 'infra-20261109-100000', 'infra-reczne']);
    expect(existsSync(join(kat, 'notatki.txt'))).toBe(true);
  });

  it('dwa najnowsze katalogi infra zostają, nawet gdy mają ponad 30 dni', () => {
    const kat = katalogTymczasowy('kopie-');
    mkdirSync(join(kat, 'infra-20250101-000000'));
    mkdirSync(join(kat, 'infra-20250201-000000'));
    expect(bash(`przytnij_kopie_lokalne "${kat}"`, { PRZYTNIJ_TERAZ: String(TERAZ) }).kod).toBe(0);
    expect(readdirSync(kat).sort()).toEqual(['infra-20250101-000000', 'infra-20250201-000000']);
  });

  it('ścieżka względna albo brak katalogu — nic nie robi i nie przerywa', () => {
    expect(bash('przytnij_kopie_lokalne "kopie"').kod).toBe(0);
    expect(bash('przytnij_kopie_lokalne "/nie/ma/takiego/katalogu"').kod).toBe(0);
  });

  it('pułapka EXIT przycina kopie i NIE zmienia kodu wyjścia skryptu', () => {
    const kat = przygotuj();
    const r = bash(`przytnij_kopie_przy_wyjsciu "${kat}"; false || exit 7`, { PRZYTNIJ_TERAZ: String(TERAZ) });
    expect(r.kod).toBe(7);
    expect(readdirSync(kat).filter((n) => /^grafana-\d{8}-\d{6}\.tgz$/.test(n))).toHaveLength(3);
    const ok = bash(`przytnij_kopie_przy_wyjsciu "${kat}"; exit 0`);
    expect(ok.kod).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('kopia Grafany tylko przy zmianie obrazu albo konfiguracji', () => {
  it('obraz Grafany czytany z prawdziwego docker-compose.prod.yml', () => {
    const r = bash(`obraz_uslugi_z_compose "${join(KORZEN, 'docker-compose.prod.yml')}" grafana`);
    expect(r.kod).toBe(0);
    expect(r.stdout.trim()).toMatch(/^grafana\/grafana:\d+\.\d+\.\d+$/);
    const brak = bash(`obraz_uslugi_z_compose "${join(KORZEN, 'docker-compose.prod.yml')}" nie-ma-takiej`);
    expect(brak.stdout.trim()).toBe('');
  });

  it('pierwsza kopia, potem pominięcie, potem kopia po zmianie wersji i po zmianie grafana.ini', () => {
    const kat = katalogTymczasowy('grafana-');
    const ini = join(kat, 'grafana.ini');
    writeFileSync(ini, '[server]\n');
    const decyzja = (obraz: string) =>
      bash(`o="$(odcisk_grafany "${obraz}" "${ini}")"; if kopia_grafany_potrzebna "${kat}" "$o"; then echo TAK; else echo NIE; fi`).stdout.trim();
    const zrobKopie = (obraz: string) => {
      writeFileSync(join(kat, `grafana-2026111${Math.floor(Math.random() * 9)}-000000.tgz`), 'x');
      bash(`zapisz_odcisk_grafany "${kat}" "$(odcisk_grafany "${obraz}" "${ini}")"`);
    };

    expect(decyzja('grafana/grafana:13.2.2')).toBe('TAK'); // brak jakiejkolwiek kopii
    zrobKopie('grafana/grafana:13.2.2');
    expect(decyzja('grafana/grafana:13.2.2')).toBe('NIE'); // ten sam obraz i konfiguracja
    expect(decyzja('grafana/grafana:13.3.0')).toBe('TAK'); // nowa wersja
    writeFileSync(ini, '[server]\nroot_url = x\n');
    expect(decyzja('grafana/grafana:13.2.2')).toBe('TAK'); // zmiana konfiguracji
    expect(decyzja('')).toBe('TAK'); // obraz nieznany → bezpiecznie: kopia
  });

  it('deploy liczy odcisk z compose i robi kopię WYŁĄCZNIE za bramką', () => {
    const deploy = kod('ops/scripts/prod-deploy-ghcr.sh');
    expect(deploy).toMatch(/odcisk_grafany "\$\(obraz_uslugi_z_compose "\$COMPOSE_FILE" grafana\)"/);
    const bramka = deploy.indexOf('if kopia_grafany_potrzebna "$KOPIE_LOKALNE"');
    const tar = deploy.indexOf("tar czf - -C /var/lib/grafana");
    expect(bramka).toBeGreaterThan(-1);
    expect(tar).toBeGreaterThan(bramka);
    // Jedno miejsce, które pisze grafana-*.tgz w deployu — bez drugiej, niebramkowanej kopii.
    expect(deploy.match(/tar czf - -C \/var\/lib\/grafana/g)).toHaveLength(1);
    // Odcisk zapisywany dopiero po udanej (niepustej) kopii.
    expect(deploy.indexOf('zapisz_odcisk_grafany')).toBeGreaterThan(deploy.indexOf('[ -s "$KOPIA_GRAFANY.partial" ]'));
  });

  it.each(['ops/scripts/prod-deploy-ghcr.sh', 'ops/scripts/prod-infra-upgrade.sh'])(
    '%s — skrypt tworzący kopie przycina je przy wyjściu',
    (skrypt) => {
      const t = kod(skrypt);
      expect(t).toMatch(/^\. ops\/scripts\/lib\/miejsce-na-dysku\.sh$/m);
      expect(t).toMatch(/^przytnij_kopie_przy_wyjsciu /m);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('strażnik wolnego miejsca przed pobraniem obrazów', () => {
  /**
   * Atrapa `df` czyta wolne KB z pliku stanu; atrapa `docker` zapisuje wywołania
   * i po `image prune` podmienia stan na wartość „po sprzątaniu".
   */
  function srodowisko(przedMb: number | 'smieci', poMb: number) {
    const kat = katalogTymczasowy('straznik-');
    const bin = join(kat, 'bin');
    mkdirSync(bin);
    const stan = join(kat, 'wolne');
    const log = join(kat, 'wywolania');
    writeFileSync(stan, przedMb === 'smieci' ? 'brak' : String(przedMb * 1024));
    writeFileSync(log, '');
    atrapa(bin, 'df', `echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/sda1 78643200 0 $(cat '${stan}') 99% /"`);
    atrapa(bin, 'docker', `echo "docker $*" >> '${log}'; [ "$1 $2" = "image prune" ] && echo ${poMb * 1024} > '${stan}'; exit 0`);
    atrapa(bin, 'journalctl', `echo "journalctl $*" >> '${log}'`);
    const kopie = join(kat, 'kopie');
    mkdirSync(kopie);
    for (let i = 1; i <= 5; i++) writeFileSync(join(kopie, `grafana-2026110${i}-000000.tgz`), 'x');
    return { bin, log, kopie };
  }

  it('dość miejsca — nic nie sprząta', () => {
    const s = srodowisko(20 * 1024, 0);
    const r = bash(`zapewnij_miejsce_przed_pobraniem "${s.kopie}"`, {}, s.bin);
    expect(r.kod).toBe(0);
    expect(readFileSync(s.log, 'utf8')).toBe('');
  });

  it('< 5 GB — prune, przycięcie kopii, dziennik; po sprzątaniu ≥ 3 GB deploy idzie dalej', () => {
    const s = srodowisko(4 * 1024, 6 * 1024);
    const r = bash(`zapewnij_miejsce_przed_pobraniem "${s.kopie}"`, {}, s.bin);
    expect(r.kod).toBe(0);
    const w = readFileSync(s.log, 'utf8');
    expect(w).toContain('docker image prune -af');
    expect(w).toContain('docker builder prune -af');
    expect(w).toContain('journalctl --vacuum-size=500M');
    expect(readdirSync(s.kopie)).toHaveLength(3);
  });

  it('dalej < 3 GB — STOP z czytelnym komunikatem (kod 1)', () => {
    const s = srodowisko(4 * 1024, 2 * 1024);
    const r = bash(`zapewnij_miejsce_przed_pobraniem "${s.kopie}"`, {}, s.bin);
    expect(r.kod).toBe(1);
    expect(r.stderr).toContain('STOP');
    expect(r.stderr).toContain('miejsce-na-dysku.sh stan');
  });

  it('nieczytelny df nie blokuje deployu (strażnik nie może sam być awarią)', () => {
    const s = srodowisko('smieci', 0);
    const r = bash(`zapewnij_miejsce_przed_pobraniem "${s.kopie}"`, {}, s.bin);
    expect(r.kod).toBe(0);
    expect(r.stdout).toContain('UWAGA');
  });

  /** Indeks pierwszej linii kodu pasującej do wzorca. */
  function linia(t: string, wzorzec: RegExp): number {
    return t.split('\n').findIndex((l) => wzorzec.test(l));
  }

  it('ghcr: strażnik po prune i PRZED `compose pull`', () => {
    const t = kod('ops/scripts/prod-deploy-ghcr.sh');
    const prune = linia(t, /docker image prune -af/);
    const straz = linia(t, /zapewnij_miejsce_przed_pobraniem/);
    const pull = linia(t, /compose pull \$\{APP_SERVICES\}/);
    expect(prune).toBeGreaterThan(-1);
    expect(straz).toBeGreaterThan(prune);
    expect(pull).toBeGreaterThan(straz);
    // nieudany strażnik przerywa deploy
    expect(t).toMatch(/if ! zapewnij_miejsce_przed_pobraniem[^\n]*; then\n[^\n]*\n\s*exit 1/);
  });

  it.each([
    ['ops/scripts/prod-deploy-rolling.sh', /"\$\{DC\[@\]\}" build/],
    ['ops/scripts/prod-deploy-release.sh', /up -d --build/],
    ['ops/scripts/prod-infra-upgrade.sh', /compose pull \$INFRA/],
  ])('%s: strażnik przed pobieraniem/budowaniem', (skrypt, cel) => {
    const t = kod(skrypt);
    const straz = linia(t, /zapewnij_miejsce_przed_pobraniem/);
    expect(straz).toBeGreaterThan(-1);
    expect(linia(t, cel)).toBeGreaterThan(straz);
  });

  it.each(['ops/scripts/prod-deploy-rolling.sh', 'ops/scripts/prod-deploy-release.sh'])(
    '%s: po buildzie usuwa osierocone obrazy (dangling), nie tylko cache',
    (skrypt) => {
      const t = kod(skrypt);
      expect(t).toContain('docker builder prune -af');
      expect(t).toMatch(/docker image prune -f\b/);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('pliki hosta: limit journald i systemd-tmpfiles (wersjonowane, idempotentne)', () => {
  function srodowisko() {
    const kat = katalogTymczasowy('host-');
    const bin = join(kat, 'bin');
    const etc = join(kat, 'etc');
    mkdirSync(bin);
    const log = join(kat, 'wywolania');
    writeFileSync(log, '');
    for (const p of ['systemctl', 'journalctl', 'systemd-tmpfiles']) atrapa(bin, p, `echo "${p} $*" >> '${log}'`);
    return { bin, etc, log };
  }

  it('pliki w repo mówią to, co mają mówić', () => {
    const j = kod('ops/systemd/journald-verris-limit.conf');
    expect(j).toMatch(/^\[Journal\]$/m);
    expect(j).toMatch(/^SystemMaxUse=500M$/m);
    const t = kod('ops/systemd/tmpfiles-verris.conf');
    expect(t).toMatch(/^d\s+\/tmp\/verris-backup-staging\s+0700\s+root\s+root\s+\d+d$/m);
    expect(t).toMatch(/^d\s+\/tmp\/verris-restore-staging\s+0700\s+root\s+root\s+\d+d$/m);
  });

  it('pierwsza instalacja zastępuje ręczny plik i restartuje journald; druga nic nie robi', () => {
    const s = srodowisko();
    // Plik założony ręcznie 10.11 — ta sama nazwa, inna treść.
    mkdirSync(join(s.etc, 'systemd', 'journald.conf.d'), { recursive: true });
    writeFileSync(join(s.etc, 'systemd', 'journald.conf.d', 'verris-limit.conf'), '[Journal]\nSystemMaxUse=500M # ręcznie\n');

    const r1 = bash(`zainstaluj_pliki_hosta_dysku "${KORZEN}"`, { VERRIS_ETC_ROOT: s.etc }, s.bin);
    expect(r1.kod).toBe(0);
    expect(readFileSync(join(s.etc, 'systemd', 'journald.conf.d', 'verris-limit.conf'), 'utf8')).toBe(
      readFileSync(join(KORZEN, 'ops', 'systemd', 'journald-verris-limit.conf'), 'utf8'),
    );
    expect(readFileSync(join(s.etc, 'tmpfiles.d', 'verris.conf'), 'utf8')).toBe(
      readFileSync(join(KORZEN, 'ops', 'systemd', 'tmpfiles-verris.conf'), 'utf8'),
    );
    const w1 = readFileSync(s.log, 'utf8');
    expect(w1).toContain('systemctl restart systemd-journald');
    expect(w1).toContain('journalctl --vacuum-size=500M');
    expect(w1).toContain(`systemd-tmpfiles --create ${join(s.etc, 'tmpfiles.d', 'verris.conf')}`);

    writeFileSync(s.log, '');
    expect(bash(`zainstaluj_pliki_hosta_dysku "${KORZEN}"`, { VERRIS_ETC_ROOT: s.etc }, s.bin).kod).toBe(0);
    expect(readFileSync(s.log, 'utf8')).toBe('');
  });

  it('deploy instaluje pliki hosta przy każdym przebiegu; świeży host — przez instalator security', () => {
    expect(kod('ops/scripts/prod-deploy-ghcr.sh')).toMatch(/^zainstaluj_pliki_hosta_dysku "\$\(pwd\)" \|\| true$/m);
    expect(kod('ops/scripts/security-install-verris-security.sh')).toContain(
      `run "bash '$REPO_ROOT/ops/scripts/lib/miejsce-na-dysku.sh' zainstaluj"`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('compose: logi kontenerów i retencja metryk mają limit', () => {
  /** Bloki usług z sekcji `services:` (wcięcie 2 spacje). */
  function uslugi(sciezka: string): Map<string, string> {
    const t = kod(sciezka);
    const od = t.indexOf('\nservices:\n');
    expect(od).toBeGreaterThan(-1);
    const reszta = t.slice(od + '\nservices:\n'.length);
    const koniec = reszta.search(/\n[a-z]/);
    const sekcja = koniec === -1 ? reszta : reszta.slice(0, koniec);
    const mapa = new Map<string, string>();
    const czesci = sekcja.split(/^ {2}([a-z][\w-]*):\s*$/m);
    for (let i = 1; i < czesci.length; i += 2) mapa.set(czesci[i], czesci[i + 1]);
    return mapa;
  }

  it.each(['docker-compose.prod.yml', 'ops/docker-compose.sogo-mail.yml'])(
    '%s: każda usługa ma logging z rotacją',
    (plik) => {
      const t = kod(plik);
      const kotwica = t.match(/^x-logging: &default-logging\n((?: {2}.*\n)+)/m);
      expect(kotwica).not.toBeNull();
      expect(kotwica![1]).toMatch(/driver: (json-file|local)/);
      expect(kotwica![1]).toMatch(/max-size: '\d+m'/);
      expect(kotwica![1]).toMatch(/max-file: '\d+'/);
      const u = uslugi(plik);
      expect(u.size).toBeGreaterThan(1); // strażnik strażnika
      const bez = [...u].filter(([, blok]) => !/^ {4}logging: \*default-logging$/m.test(blok)).map(([n]) => n);
      expect(bez).toEqual([]);
    },
  );

  it('Prometheus ma retencję czasową I rozmiarową', () => {
    const t = kod('docker-compose.prod.yml');
    expect(t).toMatch(/--storage\.tsdb\.retention\.time=\d+d/);
    expect(t).toMatch(/--storage\.tsdb\.retention\.size=\d+GB/);
  });

  it('Loki kasuje stare logi (compactor z retencją)', () => {
    const t = kod('ops/observability/loki/config.yaml');
    expect(t).toMatch(/retention_enabled: true/);
    expect(t).toMatch(/retention_period: \d+h/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('alarm o dysku panelu, zanim będzie za późno', () => {
  const reguly = kod('ops/observability/grafana/provisioning/alerting/rules.yaml');

  function blok(uid: string): string {
    const od = reguly.indexOf(`- uid: ${uid}\n`);
    expect(od).toBeGreaterThan(-1);
    const nastepny = reguly.indexOf('- uid: ', od + 1);
    return reguly.slice(od, nastepny === -1 ? undefined : nastepny);
  }

  it('dane pochodzą z node_exportera na hoście panelu (job „node", root fs)', () => {
    const prom = kod('ops/observability/prometheus.yml');
    expect(prom).toMatch(/job_name: node\n\s+static_configs:\n\s+- targets: \['node-exporter:9100'\]/);
    const compose = kod('docker-compose.prod.yml');
    expect(compose).toContain("'--path.rootfs=/rootfs'");
    expect(compose).toContain('- /:/rootfs:ro');
  });

  it.each([
    ['verris-dysk-panelu-80', /> 80$/m, /for: 15m/, 'warning'],
    ['verris-dysk-panelu-90', /> 90$/m, /for: 5m/, 'critical'],
  ])('%s', (uid, prog, czas, severity) => {
    const b = blok(uid);
    expect(b).toMatch(/node_filesystem_avail_bytes\{job="node",mountpoint="\/"/);
    expect(b).toMatch(prog);
    expect(b).toMatch(czas);
    expect(b).toContain(`severity: ${severity}`);
  });

  it('prognoza: predict_linear „pełny w ciągu 24 h" z warunkiem < 0', () => {
    const b = blok('verris-dysk-panelu-pelny-za-24h');
    expect(b).toMatch(/predict_linear\(node_filesystem_avail_bytes\{job="node",mountpoint="\/"[^}]*\}\[6h\], 86400\) < 0/);
    // próg Grafany musi pasować do znaku wyrażenia (wartości są ujemne)
    expect(b).toMatch(/evaluator:\n\s+type: lt\n\s+params:\n\s+- 0/);
    expect(b).toMatch(/type: threshold/);
  });

  it('cisza eksportera dysku ma własną regułę (X-35)', () => {
    expect(blok('verris-metryki-dysku-panelu-nieobecne')).toContain('absent(node_filesystem_avail_bytes{job="node",mountpoint="/"})');
  });

  it('reguły dysku idą tam, gdzie reszta (polityka domyślna, bez osobnej gałęzi)', () => {
    const polityki = kod('ops/observability/grafana/provisioning/alerting/policies.yaml');
    expect(polityki).toMatch(/^ {4}receiver: verris-ops-email$/m);
    for (const uid of ['verris-dysk-panelu-80', 'verris-dysk-panelu-90', 'verris-dysk-panelu-pelny-za-24h']) {
      expect(blok(uid)).not.toContain('kanal:');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('/tmp/verris-*-staging: plaintext z danymi nie zostaje po przerwaniu', () => {
  function atrapyKopii() {
    const kat = katalogTymczasowy('staging-');
    const bin = join(kat, 'bin');
    mkdirSync(bin);
    // pg_dump: > 1 KB po gzip (losowe dane się nie kompresują); reszta docker — sukces
    atrapa(bin, 'docker', 'case "$*" in *pg_dump*) head -c 8192 /dev/urandom ;; *psql*) cat >/dev/null; exit 3 ;; esac; exit 0');
    atrapa(bin, 'age', 'exit 0'); // obecny, ale bez odbiorców szyfrowanie i tak odmówi
    return { kat, bin };
  }

  it('backup-postgres: padnięcie przed szyfrowaniem niszczy niezaszyfrowany zrzut', () => {
    const { kat, bin } = atrapyKopii();
    const staging = join(kat, 'backup-staging');
    const r = spawnSync('bash', [join(KORZEN, 'ops', 'backup-postgres.sh')], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        BACKUP_STAGING_DIR: staging,
        BACKUP_ENCRYPTION_ENABLED: '1',
        UPLOAD_TO_MINIO: '0',
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('staging dump'); // zrzut naprawdę powstał…
    expect(readdirSync(staging)).toEqual([]); // …i nie został
  });

  it('restore-postgres: błąd odtwarzania nie zostawia odszyfrowanego pliku', () => {
    const { kat, bin } = atrapyKopii();
    // age --decrypt -i KLUCZ -o WYJŚCIE WEJŚCIE → zapisz „plaintext"
    atrapa(bin, 'age', 'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac; done; echo plaintext | gzip > "$out"');
    const klucz = join(kat, 'klucz.txt');
    writeFileSync(klucz, 'AGE-SECRET-KEY-atrapa');
    const kopia = join(kat, 'verris-2026-11-10-0317.sql.gz.age');
    writeFileSync(kopia, 'szyfrogram');
    const r = spawnSync('bash', [join(KORZEN, 'ops', 'restore-postgres.sh'), kopia, '--confirm'], {
      encoding: 'utf8',
      env: { PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, BACKUP_AGE_IDENTITY_FILE: klucz },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('odszyfrowano'); // plaintext naprawdę powstał…
    expect(existsSync(kopia.replace(/\.age$/, ''))).toBe(false); // …i nie został
    expect(existsSync(kopia)).toBe(true); // plik podany przez człowieka nietknięty
  });

  it('drill odtworzeniowy sprząta pobrane i odszyfrowane pliki pułapką EXIT', () => {
    const t = kod('ops/scripts/restore-drill-isolated.sh');
    expect(t).toMatch(/^trap sprzatnij_drill EXIT$/m);
    const f = t.slice(t.indexOf('sprzatnij_drill() {'), t.indexOf('trap sprzatnij_drill EXIT'));
    expect(f).toContain('RESTORE_INPUT');
    expect(f).toContain('DUMP_FILE');
    expect(f).toContain('shred -u');
  });
});
