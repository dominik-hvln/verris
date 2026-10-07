import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * X-41 etap 2 — egzekwowanie egressu KONTENERÓW w DOCKER-USER (FORWARD).
 *
 * Ten sam wzór co egress-strict-naprawde-blokuje.spec.ts: PRAWDZIWY skrypt,
 * atrapy `iptables`/`ipset`/`id`, asercje na regułach, które skrypt próbował
 * założyć. Różnica: atrapa `iptables -C` pamięta, co już wpięto, więc da się
 * sprawdzić idempotencję (drugie uruchomienie nie dubluje skoku w DOCKER-USER).
 *
 * Allowlisty domen dla kontenerów NIE MA (decyzja: API/www muszą łączyć się
 * z dowolnymi hostami klientów). Są: IOC z tej samej listy co host, limit
 * nowych połączeń SMTP i ogólny limit tempa nowych połączeń — per kontener.
 */

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SKRYPT = join(KORZEN, 'ops', 'scripts', 'security-control-plane-egress.sh');
const LANCUCH = 'VERRIS_FWD_EGZEKW';
const IOC = '216.218.185.162';
const DZIEN = 86400;

interface Opcje {
  /** Ile dni temu ruszył pomiar kontenerów (`--kontenery-pomiar`); `null` = nie ruszył. */
  pomiarOdDni?: number | null;
  /** Czy łańcuch DOCKER-USER istnieje (Docker działa). */
  docker?: boolean;
  /** Katalog z poprzedniego uruchomienia — ten sam stan iptables (idempotencja). */
  kat?: string;
  /** Zawartość egress-kontenery-tryb (odtwarzanie po restarcie hosta). */
  trybKontenerow?: string;
}

function uruchom(argumenty: string[], o: Opcje = {}) {
  const kat = o.kat ?? mkdtempSync(join(tmpdir(), 'egress-fwd-'));
  const bin = join(kat, 'bin');
  const sec = join(kat, 'security');
  const wywolania = join(kat, 'wywolania.log');
  if (!o.kat) {
    mkdirSync(bin);
    mkdirSync(sec);
    writeFileSync(wywolania, '');
    writeFileSync(join(sec, 'ioc-ips.txt'), `# komentarz\n${IOC}\n2001:db8::66\nto-nie-adres\n`);
    // Allowlisty hosta — potrzebne tylko przebiegowi --przy-starcie (odtwarza też reguły hosta).
    writeFileSync(join(sec, 'egress-allow-hostnames.txt'), '');
    writeFileSync(join(sec, 'egress-allow-nets.txt'), '140.82.112.0/20\n');
    writeFileSync(join(sec, 'egress-allow-dns.txt'), '185.12.64.1\n');
    writeFileSync(join(sec, 'egress-allow-smtp.txt'), '178.63.123.4\n');
    if (o.trybKontenerow !== undefined) writeFileSync(join(sec, 'egress-kontenery-tryb'), o.trybKontenerow);
    if (o.pomiarOdDni !== undefined && o.pomiarOdDni !== null) {
      writeFileSync(
        join(sec, 'egress-kontenery-egzekw-od'),
        String(Math.floor(Date.now() / 1000) - o.pomiarOdDni * DZIEN),
      );
    }
    const atrapa = (nazwa: string, tresc: string) => {
      writeFileSync(join(bin, nazwa), `#!/usr/bin/env bash\n${tresc}\n`);
      chmodSync(join(bin, nazwa), 0o755);
    };
    atrapa('id', 'echo 0');
    atrapa('netfilter-persistent', 'exit 0');
    atrapa('ipset', 'exit 0');
    atrapa(
      'iptables',
      [
        `echo "iptables $*" >> "${wywolania}"`,
        'case "$1" in',
        // -C <łańcuch> <reguła>: „jest", jeśli wcześniej wpięto dokładnie tę regułę.
        `  -C) c="$2"; shift 2; grep -qxF -e "iptables -I $c 1 $*" -e "iptables -A $c $*" "${wywolania}"; exit $? ;;`,
        `  -L) ${o.docker === false ? 'exit 1' : 'exit 0'} ;;`,
        `  -S) grep -- "^iptables -A $2 " "${wywolania}" | sed 's/^iptables //'; exit 0 ;;`,
        'esac',
        'exit 0',
      ].join('\n'),
    );
  }
  const przed = readFileSync(wywolania, 'utf8').split('\n').filter(Boolean).length;
  const r = spawnSync('bash', [SKRYPT, ...argumenty], {
    encoding: 'utf8',
    // EGRESS_IPV6=0 — bez tego skrypt mógłby sięgnąć po prawdziwe ip6tables maszyny testowej.
    env: { PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, SECURITY_DIR: sec, EGRESS_IPV6: '0' },
  });
  const wszystkie = existsSync(wywolania) ? readFileSync(wywolania, 'utf8').split('\n').filter(Boolean) : [];
  return { kod: r.status, wyjscie: r.stdout + r.stderr, wywolania: wszystkie.slice(przed), wszystkie, kat, sec };
}

const BLOKADA = /-j (DROP|REJECT)\b/;
const SKOK = `iptables -I DOCKER-USER 1 -j ${LANCUCH}`;

describe('X-41 etap 2 — pomiar: reguły kontenerów tylko liczą i logują', () => {
  const r = uruchom(['--kontenery-pomiar']);

  it('kończy się zerem i wpina łańcuch w DOCKER-USER', () => {
    expect(r.kod).toBe(0);
    expect(r.wywolania).toContain(SKOK);
  });

  it('nie zakłada ani jednej reguły DROP/REJECT i nie dotyka OUTPUT', () => {
    expect(r.wywolania.filter((w) => BLOKADA.test(w))).toEqual([]);
    expect(r.wywolania.filter((w) => /\bOUTPUT\b/.test(w))).toEqual([]);
  });

  it('IOC z tej samej listy co host (ioc-ips.txt) — logowane z prefiksem, błędne wiersze pominięte', () => {
    expect(r.wywolania.some((w) => w.startsWith(`iptables -A ${LANCUCH} -d ${IOC} `) && /--log-prefix VERRIS-FWD-IOC/.test(w))).toBe(true);
    expect(r.wywolania.some((w) => w.includes('to-nie-adres'))).toBe(false);
  });

  it('limit SMTP i ogólny limit tempa liczone per kontener (hashlimit srcip), z własnym logiem', () => {
    const smtp = r.wywolania.find((w) => /--dports 25,465,587 .*-m hashlimit /.test(w));
    expect(smtp).toMatch(/--hashlimit-mode srcip/);
    expect(smtp).toMatch(/--hashlimit-above 60\/min/);
    const ogolny = r.wywolania.find((w) => w.includes('--hashlimit-name verris_fwd_nowe'));
    expect(ogolny).toMatch(/--hashlimit-above 20\/sec /);
    expect(ogolny).toMatch(/--hashlimit-mode srcip /);
    // Jedno sprawdzenie hashlimitu na pakiet: LOG/DROP w łańcuchu-akcji, nie w dwóch
    // regułach z tą samą nazwą (każda zużywałaby żeton — próg o połowę niższy).
    expect(r.wywolania.filter((w) => w.includes('--hashlimit-name verris_fwd_nowe'))).toHaveLength(1);
    for (const prefiks of ['VERRIS-FWD-SMTP', 'VERRIS-FWD-SKAN']) {
      expect(r.wywolania.some((w) => w.includes(`--log-prefix ${prefiks}`))).toBe(true);
    }
  });

  it('ruch do kontenerów i odpowiedzi wychodzą z łańcucha przed limitami', () => {
    const reguly = r.wywolania.filter((w) => w.startsWith(`iptables -A ${LANCUCH} `));
    const pierwszyLimit = reguly.findIndex((w) => w.includes('-m hashlimit'));
    expect(pierwszyLimit).toBeGreaterThan(0);
    for (const zwolnienie of ['--ctstate RELATED,ESTABLISHED -j RETURN', '-o docker0 -j RETURN', '-o br-+ -j RETURN']) {
      const i = reguly.findIndex((w) => w.includes(zwolnienie));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(pierwszyLimit);
    }
  });

  it('zapisuje, od kiedy trwa pomiar kontenerów, i tryb do odtworzenia po restarcie', () => {
    expect(readFileSync(join(r.sec, 'egress-kontenery-egzekw-od'), 'utf8').trim()).toMatch(/^\d{10}$/);
    expect(readFileSync(join(r.sec, 'egress-kontenery-tryb'), 'utf8').trim()).toBe('pomiar');
  });

  it('adresy IPv6 z listy IOC nie trafiają do iptables (sieci compose są tylko IPv4)', () => {
    expect(r.wywolania.some((w) => w.includes('2001:db8::66'))).toBe(false);
  });

  it('ponowne uruchomienie nie dubluje skoku w DOCKER-USER', () => {
    const drugi = uruchom(['--kontenery-pomiar'], { kat: r.kat });
    expect(drugi.kod).toBe(0);
    expect(drugi.wszystkie.filter((w) => w === SKOK)).toHaveLength(1);
  });
});

describe('X-41 etap 2 — egzekwowanie po pomiarze', () => {
  it('bez pomiaru odmawia (kod 1) i niczego nie blokuje', () => {
    const r = uruchom(['--kontenery-egzekwuj']);
    expect(r.kod).toBe(1);
    expect(r.wywolania.filter((w) => BLOKADA.test(w))).toEqual([]);
  });

  it('po krótszym niż 48 h pomiarze odmawia', () => {
    const r = uruchom(['--kontenery-egzekwuj'], { pomiarOdDni: 1 });
    expect(r.kod).toBe(1);
    expect(r.wywolania.filter((w) => BLOKADA.test(w))).toEqual([]);
  });

  it('po pomiarze zakłada DROP dla IOC, SMTP i skanu — i nie dotyka OUTPUT', () => {
    const r = uruchom(['--kontenery-egzekwuj'], { pomiarOdDni: 3 });
    expect(r.kod).toBe(0);
    expect(r.wywolania).toContain(SKOK);
    expect(r.wywolania.some((w) => w.startsWith(`iptables -A ${LANCUCH} -d ${IOC} -j DROP`) && w.includes('verris-fwd-ioc'))).toBe(true);
    for (const komentarz of ['verris-fwd-smtp', 'verris-fwd-skan']) {
      expect(r.wywolania.some((w) => /-j DROP/.test(w) && w.includes(komentarz))).toBe(true);
    }
    expect(r.wywolania.filter((w) => /\bOUTPUT\b/.test(w))).toEqual([]);
  });

  it('bez DOCKER-USER (Docker nie działa) odmawia zamiast udawać, że egzekwuje', () => {
    const r = uruchom(['--kontenery-egzekwuj'], { pomiarOdDni: 3, docker: false });
    expect(r.kod).toBe(1);
    expect(r.wywolania.filter((w) => BLOKADA.test(w))).toEqual([]);
  });
});

describe('X-41 etap 2 — rollback jedną komendą', () => {
  it('--kontenery-wylacz wypina łańcuch z DOCKER-USER, niczego nie blokuje i kasuje zapisany tryb', () => {
    const r = uruchom(['--kontenery-wylacz'], { trybKontenerow: 'egzekwuj\n' });
    expect(r.kod).toBe(0);
    expect(r.wywolania).toContain(`iptables -D DOCKER-USER -j ${LANCUCH}`);
    expect(r.wywolania.filter((w) => BLOKADA.test(w) || /\bOUTPUT\b/.test(w))).toEqual([]);
    expect(existsSync(join(r.sec, 'egress-kontenery-tryb'))).toBe(false);
  });
});

describe('X-41 etap 2 — restart hosta (verris-egress.service --przy-starcie)', () => {
  it('odtwarza zapisane egzekwowanie kontenerów', () => {
    const r = uruchom(['--przy-starcie'], { pomiarOdDni: 3, trybKontenerow: 'egzekwuj\n' });
    expect(r.kod).toBe(0);
    expect(r.wywolania).toContain(SKOK);
    expect(r.wywolania.some((w) => /-j DROP/.test(w) && w.includes('verris-fwd-skan'))).toBe(true);
  });

  it('bez DOCKER-USER odtwarza reguły hosta i tylko ostrzega o kontenerach', () => {
    const r = uruchom(['--przy-starcie'], { pomiarOdDni: 3, trybKontenerow: 'egzekwuj\n', docker: false });
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => w.includes(LANCUCH))).toBe(false);
    expect(r.wywolania.some((w) => /^iptables -I OUTPUT 1 -j VERRIS_IOC_DROP$/.test(w))).toBe(true);
    expect(r.wyjscie).toContain('--kontenery-egzekwuj');
  });

  it('bez zapisanego trybu kontenerów nie zakłada ich łańcucha', () => {
    const r = uruchom(['--przy-starcie']);
    expect(r.kod).toBe(0);
    expect(r.wywolania.some((w) => w.includes(LANCUCH))).toBe(false);
  });
});
