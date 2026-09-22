import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * SEC-01 / SEC-04 / SEC-05 — strict egress naprawdę odrzuca, nie odetnie ruchu,
 * którego nikt nie zmierzył, a pomiar jest zapisem, nie próbką.
 *
 * Strażnik zachowaniowy na wzór X-34: uruchamia PRAWDZIWY skrypt z tymi samymi
 * flagami powłoki, podmieniając tylko `iptables`, `ipset`, `id` i
 * `netfilter-persistent` atrapami, które zapisują wywołania. Asercje dotyczą
 * reguł, które skrypt faktycznie próbował założyć — nie jego prozy.
 *
 * Do 2026-09-22 strict był atrapą: DROP zagnieżdżony w teście cgroup
 * (niedostępnym na tym jądrze), WARN z kodem 0 i `|| true` w instalatorze.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const SKRYPT = join(KORZEN, 'ops', 'scripts', 'security-control-plane-egress.sh');
const INSTALATOR = join(KORZEN, 'ops', 'scripts', 'security-install-verris-security.sh');
const DZIEN = 86400;

interface Scena {
  /** Wpisy zbioru pomiaru hosta, np. "1.2.3.4,tcp:443". `null` = zbioru nie ma. */
  zmierzone: string[] | null;
  /** Adresy, dla których `ipset test <allowlista>` odpowie „jest". */
  wAllowliscie: string[];
  /** Ile dni temu zaczął się pomiar; `null` = brak pliku z datą. */
  pomiarOdDni: number | null;
  argumenty: string[];
}

function uruchom(s: Scena) {
  const kat = mkdtempSync(join(tmpdir(), 'egress-'));
  const bin = join(kat, 'bin');
  const sec = join(kat, 'security');
  mkdirSync(bin);
  mkdirSync(sec);
  const wywolania = join(kat, 'wywolania.log');
  const zbiory = join(kat, 'zbiory.txt');
  writeFileSync(wywolania, '');
  writeFileSync(zbiory, s.zmierzone === null ? '' : 'verris_egress_seen\n');
  writeFileSync(join(kat, 'zmierzone.txt'), (s.zmierzone ?? []).join('\n') + '\n');
  writeFileSync(join(kat, 'allow.txt'), s.wAllowliscie.join('\n') + '\n');
  writeFileSync(join(sec, 'ioc-ips.txt'), '');
  writeFileSync(join(sec, 'egress-allow-hostnames.txt'), '');
  writeFileSync(join(sec, 'egress-allow-nets.txt'), '140.82.112.0/20\n');
  if (s.pomiarOdDni !== null) {
    writeFileSync(
      join(sec, 'egress-pomiar-od'),
      String(Math.floor(Date.now() / 1000) - s.pomiarOdDni * DZIEN),
    );
  }

  const atrapa = (nazwa: string, tresc: string) => {
    writeFileSync(join(bin, nazwa), `#!/usr/bin/env bash\n${tresc}\n`);
    chmodSync(join(bin, nazwa), 0o755);
  };
  atrapa('id', 'echo 0');
  atrapa('netfilter-persistent', 'exit 0');
  atrapa(
    'iptables',
    [
      `echo "iptables $*" >> "${wywolania}"`,
      'case "$1" in',
      '  -C) exit 1 ;;',
      '  -L) exit 1 ;;',
      `  -S) grep -- "^iptables -A $2 " "${wywolania}" | sed 's/^iptables //'; exit 0 ;;`,
      'esac',
      'exit 0',
    ].join('\n'),
  );
  atrapa(
    'ipset',
    [
      `echo "ipset $*" >> "${wywolania}"`,
      'case "$1" in',
      `  create) grep -qx "$2" "${zbiory}" || echo "$2" >> "${zbiory}"; exit 0 ;;`,
      `  list) if [ "$2" = "-n" ]; then cat "${zbiory}"; exit 0; fi`,
      `        if [ "$2" = "verris_egress_seen" ]; then echo "Name: $2"; echo "Members:"; grep . "${join(kat, 'zmierzone.txt')}" | sed 's/$/ timeout 600000 packets 3 bytes 180/'; fi; exit 0 ;;`,
      `  test) grep -qx "$3" "${join(kat, 'allow.txt')}"; exit $? ;;`,
      'esac',
      'exit 0',
    ].join('\n'),
  );

  const r = spawnSync('bash', [SKRYPT, ...s.argumenty], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
      SECURITY_DIR: sec,
    },
  });
  const log = existsSync(wywolania) ? readFileSync(wywolania, 'utf8') : '';
  return { kod: r.status, wyjscie: r.stdout + r.stderr, wywolania: log.split('\n').filter(Boolean) };
}

const DROP_STRICT = /-A VERRIS_EGRESS_STRICT .*-j DROP .*verris-strict-egress-host/;

describe('SEC-01 — strict naprawdę odrzuca', () => {
  it('po tygodniu pomiaru z pełnym pokryciem zakłada regułę DROP i kończy się zerem', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443', '8.8.8.8,udp:53'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(0);
    const drop = r.wywolania.filter((w) => DROP_STRICT.test(w));
    expect(drop).toHaveLength(1);
    expect(drop[0]).not.toMatch(/cgroup/);
  });

  it('żadna reguła skryptu nie opiera się na dopasowaniu cgroup', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.wywolania.filter((w) => /-m cgroup/.test(w))).toEqual([]);
  });

  it('--wymus-strict zakłada DROP mimo celów spoza allowlisty — i mówi, że to robi', () => {
    const r = uruchom({
      zmierzone: ['5.6.7.8,tcp:443'],
      wAllowliscie: [],
      pomiarOdDni: 1,
      argumenty: ['--wymus-strict'],
    });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(true);
    expect(r.wyjscie).toContain('--wymus-strict');
  });
});

describe('SEC-06 (warunek wstępny) — strict nie odetnie ruchu, którego nikt nie zmierzył', () => {
  it('odmawia, gdy host łączył się z celem 80/443 spoza allowlisty, i nazywa ten cel', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443', '5.6.7.8,tcp:443'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 30,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('5.6.7.8,tcp:443');
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
  });

  it('odmawia, gdy pomiar trwa krócej niż tydzień', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 2,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(1);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
  });

  it('świeża instalacja (bez pomiaru) nie przechodzi od razu w strict', () => {
    const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: ['--strict'] });
    expect(r.kod).toBe(1);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
  });

  it('cele spoza 80/443 (DNS, SMTP) nie blokują strict, który ich nie dotyczy', () => {
    const r = uruchom({
      zmierzone: ['9.9.9.9,udp:53', '1.1.1.1,tcp:25'],
      wAllowliscie: [],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(0);
  });
});

describe('SEC-04 — ruch do kontenerów nie jest egressem', () => {
  const r = uruchom({
    zmierzone: ['140.82.121.33,tcp:443'],
    wAllowliscie: ['140.82.121.33'],
    pomiarOdDni: 8,
    argumenty: ['--strict'],
  });

  it.each(['VERRIS_EGRESS_STRICT', 'VERRIS_EGRESS_BOGON'])(
    '%s zwalnia mostki Dockera (br-+ i docker0) przed pierwszym DROP',
    (lancuch) => {
      const reguly = r.wywolania.filter((w) => w.startsWith(`iptables -A ${lancuch} `));
      const pierwszyDrop = reguly.findIndex((w) => /-j DROP/.test(w));
      expect(pierwszyDrop).toBeGreaterThan(0);
      for (const iface of ['br-+', 'docker0']) {
        const i = reguly.findIndex((w) => w.includes(`-o ${iface} -j RETURN`));
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(pierwszyDrop);
      }
    },
  );
});

describe('SEC-05 — pomiar jest zapisem, nie próbką', () => {
  const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [] });

  it('przebieg domyślny zakłada zbiór pomiaru i nic nie odrzuca w strict', () => {
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => /^ipset create verris_egress_seen hash:ip,port .*timeout/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
  });

  it('każde NOWE połączenie TCP i UDP trafia do zbioru — bez ogranicznika częstotliwości', () => {
    const zapis = r.wywolania.filter((w) =>
      /^iptables -A VERRIS_EGRESS_SEEN .*-j SET --add-set verris_egress_seen dst,dst/.test(w),
    );
    expect(zapis.map((w) => /-p (tcp|udp)/.exec(w)?.[1]).sort()).toEqual(['tcp', 'udp']);
    for (const w of zapis) expect(w).not.toMatch(/-m limit/);
  });

  it('łańcuch pomiaru jest wpięty w OUTPUT', () => {
    expect(r.wywolania.some((w) => /^iptables -I OUTPUT 1 -j VERRIS_EGRESS_SEEN$/.test(w))).toBe(true);
  });
});

describe('SEC-01 — instalator nie włącza strict po cichu', () => {
  it('żadna linia kodu instalatora nie woła --strict', () => {
    const kod = readFileSync(INSTALATOR, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l) && !/^\s*log /.test(l));
    expect(kod.filter((l) => /security-control-plane-egress\.sh[^"]*--strict/.test(l))).toEqual([]);
  });
});
