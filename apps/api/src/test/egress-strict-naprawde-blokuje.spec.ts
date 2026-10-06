import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'fs';
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

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
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
  /** SEC-03: pusty plik resolwerów DNS. */
  pustyDns?: boolean;
  /** IPv6: `1` = atrapa ip6tables + EGRESS_IPV6=1; `0`/brak = EGRESS_IPV6=0. */
  ipv6?: '1' | '0';
  /** Wpisy zbioru pomiaru IPv6; brak = zbioru nie ma. */
  zmierzone6?: string[];
  pomiar6OdDni?: number | null;
  /** Zawartość egress-allow-dns-owners.txt. */
  wlasciciele?: string;
  /** Zawartość egress-tryb (usługa po restarcie). */
  tryb?: string;
  /** Zawartość egress-pomiar.ipset. */
  zrzut?: string;
  /** Zawartość ioc-ips.txt. */
  ioc?: string;
  /** SEC-06 --odswiez: zawartość egress-allow-hostnames.txt i odpowiedź atrapy `getent ahosts`. */
  nazwy?: string;
  getent?: Record<string, string[]>;
  /** Zbiory allowlisty już istnieją (strict albo --allowlist działał wcześniej). */
  zbioryAllow?: boolean;
  /** Zawartość egress-allow-hostnames.local.txt (dawny plik domen klientów — skrypt ma go ignorować). */
  lokalne?: string;
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
  writeFileSync(
    zbiory,
    (s.zmierzone === null ? '' : 'verris_egress_seen\n') +
      (s.zmierzone6 ? 'verris_egress_seen6\n' : '') +
      (s.zbioryAllow ? 'verris_egress_https\nverris_egress_https6\n' : ''),
  );
  writeFileSync(join(kat, 'zmierzone.txt'), (s.zmierzone ?? []).join('\n') + '\n');
  writeFileSync(join(kat, 'zmierzone6.txt'), (s.zmierzone6 ?? []).join('\n') + '\n');
  const przywrocone = join(kat, 'przywrocone.txt');
  writeFileSync(przywrocone, '');
  writeFileSync(join(kat, 'allow.txt'), s.wAllowliscie.join('\n') + '\n');
  writeFileSync(join(sec, 'ioc-ips.txt'), s.ioc ?? '');
  writeFileSync(join(sec, 'egress-allow-hostnames.txt'), s.nazwy ?? '');
  writeFileSync(join(sec, 'egress-allow-nets.txt'), '140.82.112.0/20\n');
  writeFileSync(
    join(sec, 'egress-allow-dns.txt'),
    s.pustyDns ? '# pusto\n' : '185.12.64.1\n185.12.64.2\n2a01:4ff:ff00::add:1\n2a01:4ff:ff00::add:2\n',
  );
  if (s.lokalne !== undefined) writeFileSync(join(sec, 'egress-allow-hostnames.local.txt'), s.lokalne);
  if (s.wlasciciele !== undefined) writeFileSync(join(sec, 'egress-allow-dns-owners.txt'), s.wlasciciele);
  if (s.tryb !== undefined) writeFileSync(join(sec, 'egress-tryb'), s.tryb);
  if (s.zrzut !== undefined) writeFileSync(join(sec, 'egress-pomiar.ipset'), s.zrzut);
  if (s.pomiar6OdDni != null) {
    writeFileSync(
      join(sec, 'egress-pomiar6-od'),
      String(Math.floor(Date.now() / 1000) - s.pomiar6OdDni * DZIEN),
    );
  }
  writeFileSync(join(sec, 'egress-allow-smtp.txt'), '178.63.123.4\n');
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
  if (s.getent) {
    const przypadki = Object.entries(s.getent)
      .map(([n, a]) => `  ${n}) printf '%s STREAM ${'$'}3\\n' ${a.map((x) => `'${x}'`).join(' ')} ;;`)
      .join('\n');
    atrapa('getent', ['case "$2" in', przypadki, '  *) exit 2 ;;', 'esac'].join('\n'));
  }
  atrapa('netfilter-persistent', 'exit 0');
  atrapa(
    'iptables',
    [
      `echo "iptables $*" >> "${wywolania}"`,
      'case "$1" in',
      '  -C) exit 1 ;;',
      `  -L) ${process.env.EGRESS_ATRAPA_DOCKER === '1' ? 'exit 0' : 'exit 1'} ;;`,
      `  -S) grep -- "^iptables -A $2 " "${wywolania}" | sed 's/^iptables //'; exit 0 ;;`,
      'esac',
      'exit 0',
    ].join('\n'),
  );
  if (s.ipv6 === '1') {
    atrapa(
      'ip6tables',
      [
        `echo "ip6tables $*" >> "${wywolania}"`,
        'case "$1" in',
        '  -C) exit 1 ;;',
        `  -S) grep -- "^ip6tables -A $2 " "${wywolania}" | sed 's/^ip6tables //'; exit 0 ;;`,
        'esac',
        'exit 0',
      ].join('\n'),
    );
  }
  atrapa(
    'ipset',
    [
      `echo "ipset $*" >> "${wywolania}"`,
      'case "$1" in',
      `  create) grep -qx "$2" "${zbiory}" || echo "$2" >> "${zbiory}"; exit 0 ;;`,
      `  list) if [ "$2" = "-n" ]; then cat "${zbiory}"; exit 0; fi`,
      `        if [ "$2" = "verris_egress_seen" ]; then echo "Name: $2"; echo "Members:"; grep . "${join(kat, 'zmierzone.txt')}" | sed 's/$/ timeout 600000 packets 3 bytes 180/'; fi`,
      `        if [ "$2" = "verris_egress_seen6" ]; then echo "Name: $2"; echo "Members:"; grep . "${join(kat, 'zmierzone6.txt')}" | sed 's/$/ timeout 600000 packets 3 bytes 180/'; fi; exit 0 ;;`,
      `  save) echo "create $2 hash:ip,port family inet timeout 604800"; echo "add $2 1.2.3.4,tcp:443 timeout 500000"; exit 0 ;;`,
      `  restore) cat >> "${przywrocone}"; exit 0 ;;`,
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
      // Domyślnie 0: runner CI może mieć prawdziwe ip6tables i trasę IPv6.
      EGRESS_IPV6: s.ipv6 ?? '0',
    },
  });
  const log = existsSync(wywolania) ? readFileSync(wywolania, 'utf8') : '';
  return {
    kod: r.status,
    wyjscie: r.stdout + r.stderr,
    wywolania: log.split('\n').filter(Boolean),
    sec,
    przywrocone: readFileSync(przywrocone, 'utf8'),
  };
}

/** Jak `uruchom`, ale `iptables -L` odpowiada sukcesem — łańcuch DOCKER-USER istnieje. */
function uruchomZDockerem() {
  process.env.EGRESS_ATRAPA_DOCKER = '1';
  try {
    return uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [] });
  } finally {
    delete process.env.EGRESS_ATRAPA_DOCKER;
  }
}

const DROP_STRICT = /-A VERRIS_EGRESS_STRICT .*-j DROP .*verris-strict-egress-host/;

describe('SEC-01 — strict naprawdę odrzuca', () => {
  it('po tygodniu pomiaru z pełnym pokryciem zakłada regułę DROP i kończy się zerem', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443', '185.12.64.1,udp:53'],
      wAllowliscie: ['140.82.121.33', '185.12.64.1'],
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

  it('cel w sieci link-local/prywatnej (odcinany już przez BOGON) nie blokuje strict', () => {
    // Pierwszy odczyt pomiaru na produkcji, 2026-09-22: 169.254.169.254:80,
    // metadane chmury. Łańcuch bogonów odrzuca go od zawsze — strict nie ma
    // tu czego „odcinać", więc nie może to być powód odmowy.
    const r = uruchom({
      zmierzone: ['169.254.169.254,tcp:80', '140.82.121.33,tcp:443'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(true);
  });

  it('cele spoza strict (np. rspamd fuzzy na UDP 11335) nie blokują włączenia', () => {
    const r = uruchom({
      zmierzone: ['80.241.57.6,udp:11335'],
      wAllowliscie: [],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(0);
  });
});

describe('SEC-03 — strict obejmuje DNS i SMTP', () => {
  it('DNS i SMTP do celów z list: strict zakłada DROP dla 53 (udp+tcp) i 25/465/587', () => {
    const r = uruchom({
      zmierzone: ['185.12.64.1,udp:53', '178.63.123.4,tcp:25'],
      wAllowliscie: ['185.12.64.1', '178.63.123.4'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.kod).toBe(0);
    for (const p of ['udp', 'tcp']) {
      expect(r.wywolania.some((w) => new RegExp(`-A VERRIS_EGRESS_STRICT -p ${p} --dport 53 .*verris_egress_dns.*-j DROP`).test(w))).toBe(true);
    }
    expect(r.wywolania.some((w) => /-A VERRIS_EGRESS_STRICT -p tcp -m multiport --dports 25,465,587 .*verris_egress_smtp.*-j DROP/.test(w))).toBe(true);
    expect(r.wywolania).toContain('ipset add verris_egress_dns_new 185.12.64.2 -exist');
  });

  it.each([
    ['9.9.9.9,udp:53', 'obcy resolwer (np. tunel DNS)'],
    ['1.2.3.4,tcp:587', 'obcy serwer SMTP'],
  ])('odmawia strict, gdy host łączył się z %s — %s', (cel) => {
    const r = uruchom({ zmierzone: [cel], wAllowliscie: [], pomiarOdDni: 8, argumenty: ['--strict'] });
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain(cel);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
  });

  it('pusta lista DNS = odmowa, a nie strict bez resolwera', () => {
    const r = uruchom({ zmierzone: [], wAllowliscie: [], pomiarOdDni: 8, argumenty: ['--strict'], pustyDns: true });
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('Lista DNS');
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

describe('SEC-04 — anty-skan nie liczy ruchu do kontenerów (01.10: docker-proxy IPv6 → DROP całego IPv6)', () => {
  it.each(['iptables', 'ip6tables'])('%s VERRIS_ANTISCAN zwalnia lo, docker0 i br-+ przed licznikiem', (bin) => {
    const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [], ipv6: '1' });
    expect(r.kod).toBe(0);
    const reguly = r.wywolania.filter((w) => w.startsWith(`${bin} -A VERRIS_ANTISCAN `));
    const licznik = reguly.findIndex((w) => w.includes('-m recent --set'));
    expect(licznik).toBeGreaterThan(0);
    for (const iface of ['lo', 'docker0', 'br-+']) {
      const i = reguly.findIndex((w) => w.includes(`-o ${iface} -j RETURN`));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(licznik);
    }
  });
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

  it('TCP liczy tylko SYN — spóźnione odpowiedzi do skanerów SSH to nie ruch wychodzący', () => {
    const tcp = r.wywolania.filter((w) => /-p tcp .*-j SET --add-set verris_egress_seen(_fwd)? /.test(w));
    expect(tcp.length).toBeGreaterThan(0);
    for (const w of tcp) expect(w).toMatch(/-p tcp --syn /);
  });

  it('łańcuch pomiaru jest wpięty w OUTPUT', () => {
    expect(r.wywolania.some((w) => /^iptables -I OUTPUT 1 -j VERRIS_EGRESS_SEEN$/.test(w))).toBe(true);
  });
});

describe('SEC-09 — kontenery nie sięgają do metadanych chmury', () => {
  it('przebieg domyślny odrzuca ruch kontenerów do 169.254.0.0/16 i wpina to w DOCKER-USER', () => {
    // Atrapa odpowiada na `-L` kodem 1 („brak łańcucha"), więc tu podmieniamy
    // tylko tę odpowiedź: DOCKER-USER istnieje, jak na produkcji.
    const r = uruchomZDockerem();
    expect(r.kod).toBe(0);
    expect(
      r.wywolania.some((w) => /^iptables -A VERRIS_FWD_METADANE -d 169\.254\.0\.0\/16 -j REJECT/.test(w)),
    ).toBe(true);
    expect(r.wywolania.some((w) => /^iptables -I DOCKER-USER 1 -j VERRIS_FWD_METADANE$/.test(w))).toBe(true);
  });
});

describe('X-41 — pomiar kontenerów ma własną datę początku', () => {
  it('--obserwuj-kontenery zakłada zbiór pomiaru kontenerów i zapisuje, od kiedy mierzy', () => {
    process.env.EGRESS_ATRAPA_DOCKER = '1';
    try {
      const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: ['--obserwuj-kontenery'] });
      expect(r.kod).toBe(0);
      expect(r.wywolania.some((w) => /^ipset create verris_egress_seen_fwd hash:ip,port/.test(w))).toBe(true);
      expect(readFileSync(join(r.sec, 'egress-pomiar-kontenery-od'), 'utf8').trim()).toMatch(/^\d{10}$/);
      expect(r.wywolania.some((w) => /-j (DROP|REJECT)/.test(w))).toBe(false);
    } finally {
      delete process.env.EGRESS_ATRAPA_DOCKER;
    }
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

describe('IPv6 — ta sama ochrona po IPv6', () => {
  const V6_REJECT = /^ip6tables -A VERRIS_EGRESS_STRICT .*-j REJECT .*verris-strict-egress-host/;

  it('przebieg domyślny: pomiar IPv6 (inet6), bogony i IOC w ip6tables, bez strict', () => {
    const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [], ipv6: '1' });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => /^ipset create verris_egress_seen6 hash:ip,port family inet6 .*timeout/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => /^ip6tables -A VERRIS_EGRESS_SEEN -p tcp --syn -j SET --add-set verris_egress_seen6 dst,dst/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => /^ip6tables -I OUTPUT 1 -j VERRIS_EGRESS_SEEN$/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => /^ip6tables -A VERRIS_EGRESS_BOGON .*-d fc00::\/7 .*-j DROP/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => V6_REJECT.test(w))).toBe(false);
    expect(readFileSync(join(r.sec, 'egress-pomiar6-od'), 'utf8').trim()).toMatch(/^\d{10}$/);
  });

  it('EGRESS_IPV6=0: ani jednego wywołania ip6tables', () => {
    const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [], ipv6: '0' });
    expect(r.kod).toBe(0);
    expect(r.wywolania.filter((w) => w.startsWith('ip6tables'))).toEqual([]);
  });

  it('strict po tygodniu pomiaru obu rodzin: REJECT w ip6tables, resolwery IPv6 Hetznera w zbiorze DNS', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443'],
      wAllowliscie: ['140.82.121.33', '2a01:4ff:ff00::add:1'],
      pomiarOdDni: 8,
      zmierzone6: ['2a01:4ff:ff00::add:1,udp:53'],
      pomiar6OdDni: 8,
      argumenty: ['--strict'],
      ipv6: '1',
    });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(true);
    expect(r.wywolania.some((w) => V6_REJECT.test(w))).toBe(true);
    for (const p of ['udp', 'tcp']) {
      expect(r.wywolania.some((w) => new RegExp(`^ip6tables -A VERRIS_EGRESS_STRICT -p ${p} --dport 53 .*verris_egress_dns6.*-j REJECT`).test(w))).toBe(true);
    }
    expect(r.wywolania).toContain('ipset add verris_egress_dns6_new 2a01:4ff:ff00::add:1 -exist');
    expect(r.wywolania).not.toContain('ipset add verris_egress_dns_new 2a01:4ff:ff00::add:1 -exist');
    expect(r.wywolania.some((w) => /^ip6tables -I OUTPUT 6 -j VERRIS_EGRESS_STRICT$/.test(w))).toBe(true);
    expect(readFileSync(join(r.sec, 'egress-tryb'), 'utf8').trim()).toBe('strict');
  });

  it('pomiar IPv6 krótszy niż tydzień: odmowa i ŻADNEJ reguły strict — także IPv4', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 8,
      zmierzone6: [],
      pomiar6OdDni: 1,
      argumenty: ['--strict'],
      ipv6: '1',
    });
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('IPv6');
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
    expect(r.wywolania.some((w) => V6_REJECT.test(w))).toBe(false);
  });

  it('cel IPv6 spoza allowlisty: odmowa, która go nazywa; adres ULA (bogon) nie przeszkadza', () => {
    const r = uruchom({
      zmierzone: [],
      wAllowliscie: [],
      pomiarOdDni: 8,
      zmierzone6: ['2606:4700::1,tcp:443', 'fd00::5,tcp:443'],
      pomiar6OdDni: 8,
      argumenty: ['--strict'],
      ipv6: '1',
    });
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('2606:4700::1,tcp:443');
    expect(r.wyjscie).not.toContain('fd00::5,tcp:443');
  });

  it('IOC z adresem IPv6 trafia do ip6tables, nie do iptables', () => {
    const r = uruchom({
      zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [], ipv6: '1',
      ioc: '45.148.10.141\n2001:67c:2e8::66 # skaner\n',
    });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => /^ip6tables -A VERRIS_IOC_DROP -d 2001:67c:2e8::66 -j DROP/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => /^iptables .*-d 2001:67c:2e8::66/.test(w))).toBe(false);
    expect(r.wywolania.some((w) => /^iptables -A VERRIS_IOC_DROP -d 45\.148\.10\.141 -j DROP/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => /^ip6tables -I OUTPUT 1 -j VERRIS_IOC_DROP$/.test(w))).toBe(true);
  });
});

describe('SEC-03 — wyjątek DNS dla resolwera lokalnego', () => {
  it('użytkownik z egress-allow-dns-owners.txt wychodzi z łańcucha przed DROP DNS', () => {
    const r = uruchom({
      zmierzone: ['185.12.64.1,udp:53'],
      wAllowliscie: ['185.12.64.1'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
      wlasciciele: '# resolwer\nunbound\n',
    });
    expect(r.kod).toBe(0);
    const reguly = r.wywolania.filter((w) => w.startsWith('iptables -A VERRIS_EGRESS_STRICT '));
    const wyjatek = reguly.findIndex((w) => /-p udp --dport 53 -m owner --uid-owner unbound -j RETURN/.test(w));
    const drop = reguly.findIndex((w) => /-p udp --dport 53 .*verris_egress_dns.*-j DROP/.test(w));
    expect(wyjatek).toBeGreaterThanOrEqual(0);
    expect(wyjatek).toBeLessThan(drop);
    // Zapytania resolwera idą do osobnego zbioru — nie zasłaniają odstępstw w zbiorze hosta.
    expect(r.wywolania.some((w) => /^iptables -A VERRIS_EGRESS_SEEN -p udp --dport 53 -m owner --uid-owner unbound -j SET --add-set verris_egress_seen_resolver /.test(w))).toBe(true);
  });

  it('pusty plik właścicieli: żadnego wyjątku po owner', () => {
    const r = uruchom({
      zmierzone: ['185.12.64.1,udp:53'],
      wAllowliscie: ['185.12.64.1'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
      wlasciciele: '# nikt\n',
    });
    expect(r.kod).toBe(0);
    expect(r.wywolania.filter((w) => /--uid-owner/.test(w))).toEqual([]);
  });
});

describe('Restart hosta — verris-egress.service', () => {
  it('--zapisz-pomiar zrzuca zbiory pomiaru do pliku 0600', () => {
    const r = uruchom({ zmierzone: ['1.2.3.4,tcp:443'], wAllowliscie: [], pomiarOdDni: 3, argumenty: ['--zapisz-pomiar'] });
    expect(r.kod).toBe(0);
    const plik = join(r.sec, 'egress-pomiar.ipset');
    expect(readFileSync(plik, 'utf8')).toContain('add verris_egress_seen 1.2.3.4,tcp:443');
    expect(statSync(plik).mode & 0o777).toBe(0o600);
  });

  it('--przy-starcie w trybie strict: przywraca strict mimo krótkiego (odtworzonego) pomiaru i odtwarza TYLKO nasze zbiory', () => {
    const r = uruchom({
      zmierzone: ['5.6.7.8,tcp:443'],
      wAllowliscie: [],
      pomiarOdDni: 1,
      argumenty: ['--przy-starcie'],
      tryb: 'strict\n',
      zrzut: 'create verris_egress_seen hash:ip,port family inet timeout 604800\nadd verris_egress_seen 5.6.7.8,tcp:443 timeout 1000\ndestroy verris_egress_https\nflush verris_egress_https\n',
    });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(true);
    expect(r.przywrocone).toContain('add verris_egress_seen 5.6.7.8,tcp:443');
    expect(r.przywrocone).not.toMatch(/destroy|flush/);
    // Allowlista odbudowana przed anty-skanem (X-36).
    expect(r.wywolania.some((w) => /^ipset swap verris_egress_https_new verris_egress_https$/.test(w))).toBe(true);
  });

  it('--przy-starcie w trybie domyślnym nie włącza strict', () => {
    const r = uruchom({ zmierzone: [], wAllowliscie: [], pomiarOdDni: 1, argumenty: ['--przy-starcie'], tryb: 'domyslny\n' });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
  });

  it('przebieg domyślny zapisuje tryb, żeby restart go odtworzył', () => {
    const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [] });
    expect(readFileSync(join(r.sec, 'egress-tryb'), 'utf8').trim()).toBe('domyslny');
  });

  it('instalator zakłada i włącza verris-egress.service', () => {
    const kod = readFileSync(INSTALATOR, 'utf8');
    expect(kod).toContain('ops/systemd/verris-egress.service');
    expect(kod).toMatch(/systemctl enable verris-egress\.service/);
  });
});

describe('SEC-06 — adresy usług za CDN dopisywane na bieżąco (--odswiez)', () => {
  const scena = (z: Partial<Scena> = {}): Scena => ({
    zmierzone: null,
    wAllowliscie: ['140.82.121.33'],
    pomiarOdDni: null,
    argumenty: ['--odswiez'],
    zbioryAllow: true,
    ipv6: '1',
    nazwy: '# komentarz\nghcr.io\ndownload.docker.com # repo apt\nnieistnieje.example\n',
    getent: {
      'ghcr.io': ['140.82.121.33'],
      'download.docker.com': ['18.66.233.5', '2600:9000:28f7:6a00:3:db06:4200:93a1', '::ffff:18.66.233.5'],
    },
    ...z,
  });

  it('dopisuje nowe adresy v4 i v6 bez podmiany zbioru, znane pomija, nic nie blokuje', () => {
    const r = uruchom(scena());
    expect(r.kod).toBe(0);
    const ipset = r.wywolania.filter((w) => w.startsWith('ipset add'));
    expect(ipset).toEqual([
      'ipset add verris_egress_https 18.66.233.5 -exist',
      'ipset add verris_egress_https6 2600:9000:28f7:6a00:3:db06:4200:93a1 -exist',
    ]);
    expect(r.wywolania.some((w) => /ipset (swap|flush|destroy)|iptables -[AIF]/.test(w))).toBe(false);
    expect(r.wyjscie).toContain('Odświeżenie: 2 nowych adresów');
  });

  it('bez zbiorów allowlisty niczego nie tworzy (strict nieaktywny)', () => {
    const r = uruchom(scena({ zbioryAllow: false }));
    expect(r.kod).toBe(0);
    expect(r.wywolania.filter((w) => /^ipset (add|create)/.test(w))).toEqual([]);
  });

  it('timer i instalator: co 15 s, włączany razem z usługą egress', () => {
    const timer = readFileSync(join(KORZEN, 'ops', 'systemd', 'verris-egress-odswiez.timer'), 'utf8');
    expect(timer).toMatch(/OnUnitActiveSec=15s/);
    const usluga = readFileSync(join(KORZEN, 'ops', 'systemd', 'verris-egress-odswiez.service'), 'utf8');
    expect(usluga).toContain('security-control-plane-egress.sh --odswiez');
    expect(readFileSync(INSTALATOR, 'utf8')).toContain('systemctl enable --now verris-egress-odswiez.timer');
  });
});

describe('Tryb strict zostaje, dopóki nie wyłączy go jawna flaga', () => {
  const strictZapisany = (argumenty: string[]): Scena => ({
    // Cel spoza allowlisty i jednodniowy pomiar: strict zatwierdzony wcześniej nie jest ponownie
    // sprawdzany — inaczej ponowna instalacja kończyłaby się odmową.
    zmierzone: ['5.6.7.8,tcp:443'],
    wAllowliscie: [],
    pomiarOdDni: 1,
    argumenty,
    tryb: 'strict\n',
    ipv6: '1',
  });

  it('przebieg bez opcji przy zapisanym strict odtwarza strict i niczego nie usuwa', () => {
    const r = uruchom(strictZapisany([]));
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(true);
    expect(r.wywolania.filter((w) => /-X VERRIS_EGRESS_STRICT/.test(w))).toEqual([]);
    expect(readFileSync(join(r.sec, 'egress-tryb'), 'utf8').trim()).toBe('strict');
  });

  it('instalator (każde jego wywołanie skryptu egress) po strict nie zdejmuje strict', () => {
    const kod = readFileSync(INSTALATOR, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l) && !/^\s*log /.test(l));
    const wywolania = kod
      .map((l) => /security-control-plane-egress\.sh'([^"]*)"/.exec(l)?.[1])
      .filter((a): a is string => a !== undefined)
      .map((a) => a.trim().split(/\s+/).filter(Boolean));
    expect(wywolania.length).toBeGreaterThan(0);
    for (const argumenty of wywolania) {
      expect(argumenty).not.toContain('--wylacz-strict');
      const r = uruchom(strictZapisany(argumenty));
      expect(r.kod).toBe(0);
      expect(r.wywolania.filter((w) => /-X VERRIS_EGRESS_STRICT/.test(w))).toEqual([]);
      expect(r.wyjscie).not.toMatch(/-X VERRIS_EGRESS_STRICT/);
      expect(readFileSync(join(r.sec, 'egress-tryb'), 'utf8').trim()).toBe('strict');
    }
  });

  it('--wylacz-strict zdejmuje VERRIS_EGRESS_STRICT (IPv4 i IPv6) i zapisuje tryb domyślny', () => {
    const r = uruchom(strictZapisany(['--wylacz-strict']));
    expect(r.kod).toBe(0);
    expect(r.wywolania).toContain('iptables -X VERRIS_EGRESS_STRICT');
    expect(r.wywolania).toContain('ip6tables -X VERRIS_EGRESS_STRICT');
    expect(r.wywolania.some((w) => DROP_STRICT.test(w))).toBe(false);
    expect(readFileSync(join(r.sec, 'egress-tryb'), 'utf8').trim()).toBe('domyslny');
  });

  it('--strict razem z --wylacz-strict to błąd, nie zgadywanie', () => {
    const r = uruchom(strictZapisany(['--strict', '--wylacz-strict']));
    expect(r.kod).toBe(1);
    expect(r.wywolania).toEqual([]);
  });

  it('przebieg bez opcji w trybie domyślnym niczego nie zdejmuje i nie włącza strict', () => {
    const r = uruchom({ zmierzone: null, wAllowliscie: [], pomiarOdDni: null, argumenty: [], tryb: 'domyslny\n' });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => /VERRIS_EGRESS_STRICT/.test(w))).toBe(false);
    expect(readFileSync(join(r.sec, 'egress-tryb'), 'utf8').trim()).toBe('domyslny');
  });

  it('--strict niczego nie usuwa', () => {
    const r = uruchom({
      zmierzone: ['140.82.121.33,tcp:443'],
      wAllowliscie: ['140.82.121.33'],
      pomiarOdDni: 8,
      argumenty: ['--strict'],
    });
    expect(r.wywolania.filter((w) => /-X VERRIS_EGRESS_STRICT/.test(w))).toEqual([]);
  });
});

describe('Domeny klientów poza allowlistą hosta (decyzja 06.10: DNS ustawia klient)', () => {
  const getent = { 'ghcr.io': ['140.82.121.33'], 'sklep-klienta.pl': ['5.6.7.8'] };

  it('--odswiez i --przy-starcie ignorują dawny plik domen klientów', () => {
    for (const [argumenty, extra] of [
      [['--odswiez'], { zmierzone: null, pomiarOdDni: null, zbioryAllow: true }],
      [['--przy-starcie'], { zmierzone: [], pomiarOdDni: 1, tryb: 'strict\n' }],
    ] as const) {
      const r = uruchom({ wAllowliscie: [], argumenty: [...argumenty], nazwy: 'ghcr.io', lokalne: '# Auto-generated\nsklep-klienta.pl\n', getent, ...extra } as never);
      expect(r.kod).toBe(0);
      expect(r.wywolania.join('\n')).toContain('140.82.121.33');
      expect(r.wywolania.join('\n')).not.toContain('5.6.7.8');
    }
  });

  it('instalator nie synchronizuje domen klientów i kasuje plik zapisany przez dawny sync', () => {
    const inst = readFileSync(join(KORZEN, 'ops', 'scripts', 'security-install-verris-security.sh'), 'utf8');
    expect(inst).not.toMatch(/^[^#]*security-sync-cp-egress-hosts\.sh/m);
    expect(inst).toMatch(/rm -f \/etc\/verris\/security\/egress-allow-hostnames\.local\.txt/);
  });

  it('jednostki systemd nie podmieniają ALLOW_HOSTS — czytają domyślną ścieżkę skryptu', () => {
    for (const plik of ['verris-egress.service', 'verris-egress-odswiez.service']) {
      expect(readFileSync(join(KORZEN, 'ops', 'systemd', plik), 'utf8')).not.toMatch(/ALLOW_HOSTS/);
    }
  });
});
