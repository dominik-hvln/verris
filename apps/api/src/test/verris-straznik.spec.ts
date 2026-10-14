import { spawnSync } from 'child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 13.10 — strażnik węzła (ops/scripts/verris-straznik.sh) na prawdziwym skrypcie z atrapami narzędzi węzła
 * (lswsctrl, cagefsctl, systemctl, dmesg, curl, getent, lvectl). Scenariusz z t1: procesy PHP konta nie wchodzą
 * do LVE (`enter LVE (1003) : result: -22`), strona 503 — strażnik zapisuje diagnozę, idzie drabiną kroków,
 * sprawdza stronę po każdym, a restart węzła robi tylko przy stanie jądra, za zgodą panelu i raz na dobę.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'verris-straznik.sh');

type Naprawa = 'lsws' | 'cagefs' | 'nigdy';

function wezel(o: { naprawa?: Naprawa; restartWezla?: boolean; uptime?: number; jednostki?: string[] } = {}) {
  const T = mkdtempSync(join(tmpdir(), 'straznik-'));
  const bin = join(T, 'bin');
  const lsws = join(T, 'lsws');
  for (const d of [bin, join(lsws, 'bin'), join(lsws, 'logs'), join(T, 'raporty'), join(T, 'da', 'ovsekucx')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(T, 'kody'), '503');
  writeFileSync(join(T, 'naprawa'), o.naprawa ?? 'lsws');
  writeFileSync(join(T, 'dmesg'), '');
  writeFileSync(join(T, 'wywolania'), '');
  writeFileSync(join(T, 'uptime'), `${o.uptime ?? 90000}.00 1.00\n`);
  writeFileSync(join(T, 'jednostki'), (o.jednostki ?? []).join('\n'));
  writeFileSync(join(T, 'config'), JSON.stringify({ restartWezla: o.restartWezla ?? true }));
  writeFileSync(join(lsws, 'logs', 'stderr.log'), '2026-10-12 19:00:00.000 [STDERR] start\n');
  writeFileSync(join(lsws, 'logs', 'error.log'), '2026-10-12 19:00:00.000 [INFO] start\n');
  writeFileSync(join(T, 'da', 'ovsekucx', 'domains.list'), 'd3.hvln.pl\n');
  writeFileSync(join(T, 'verris.conf'), `VERRIS_API_URL=https://api.test\nVERRIS_SERVER_ID=srv1\nVERRIS_IDENTITY_TOKEN=tok\n`);
  const stub = (nazwa: string, tresc: string, dir = bin) => {
    writeFileSync(join(dir, nazwa), `#!/bin/bash\nT='${T}'\necho "${nazwa} $*" >> "$T/wywolania"\n${tresc}\n`);
    chmodSync(join(dir, nazwa), 0o755);
  };
  stub('lswsctrl', `case "$1" in status) echo "litespeed is running with PID 1.";; restart) [ "$(cat $T/naprawa)" = lsws ] && echo 200 > $T/kody;; esac`, join(lsws, 'bin'));
  stub('cagefsctl', `[ "$1" = "--remount-all" ] && [ "$(cat $T/naprawa)" = cagefs ] && echo 200 > $T/kody; echo "cagefs $1"`);
  stub('curl', [
    'args="$*"',
    'case "$args" in',
    '  *straznik/config*) out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done; cp "$T/config" "$out";;',
    '  *straznik/zdarzenie*) for a in "$@"; do case "$a" in @*) n=$(ls "$T/raporty" | wc -l); cp "${a#@}" "$T/raporty/$n.json";; esac; done;;',
    '  *) cat "$T/kody";;',
    'esac',
  ].join('\n'));
  stub('systemctl', [
    'case "$1" in',
    '  reboot) echo REBOOT >> "$T/reboot";;',
    '  list-unit-files) grep -qx "${2%.service}" "$T/jednostki" && echo "$2 enabled";;',
    '  is-enabled) grep -qx "$2" "$T/jednostki" && echo enabled || echo disabled;;',
    '  is-active) cat "$T/stan-$2" 2>/dev/null || echo active;;',
    '  start) [ -e "$T/start-dziala" ] && echo active > "$T/stan-$2";;',
    '  restart|try-restart) [ "$2" = rsyslog ] || [ "$2" = rsyslog.service ] && [ -e "$T/rsyslog-naprawialny" ] && touch "$T/rsyslog-pisze";;',
    'esac',
  ].join('\n'));
  stub('dmesg', 'cat "$T/dmesg"');
  stub('journalctl', 'exit 1');
  stub('systemd-tmpfiles', 'true');
  stub('getent', '[ "$2" = 1003 ] && echo "ovsekucx:x:1003:1003::/home/ovsekucx:/bin/bash"');
  stub('lvectl', 'echo "ID SPEED"');
  stub('sleep', 'true');
  // logger: wpis trafia do pliku tylko, gdy rsyslog „pisze” (t1 13.10: po journalctl --flush przestał).
  stub('logger', '[ -e "$T/rsyslog-pisze" ] && echo "Oct 14 08:00:00 t1 $2: ${@: -1}" >> "$T/messages"; true');
  stub('pidof', 'echo 1359');
  stub('df', 'echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/vda 100 $(cat $T/dysk 2>/dev/null || echo 40) 60 $(cat $T/dysk 2>/dev/null || echo 40)% /"');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    VERRIS_CONFIG_FILE: join(T, 'verris.conf'),
    VERRIS_STRAZNIK_STAN: join(T, 'stan'),
    VERRIS_STRAZNIK_LOGDIR: join(T, 'log'),
    VERRIS_STRAZNIK_LOG: join(T, 'straznik.log'),
    VERRIS_LSWS_DIR: lsws,
    VERRIS_DA_USERS: join(T, 'da'),
    VERRIS_PROC_UPTIME: join(T, 'uptime'),
    VERRIS_JOURNAL_DIR: join(T, 'journal'),
    VERRIS_SYSLOG_PLIK: join(T, 'messages'),
  };
  const uruchom = (...args: string[]) => spawnSync('bash', [SKRYPT, ...args], { env, encoding: 'utf8' });
  const bledyLve = (n: number) => {
    for (let i = 0; i < n; i++) {
      appendFileSync(join(lsws, 'logs', 'stderr.log'), `2026-10-12 20:27:39.682 [STDERR] 2026-10-12 20:27:39.682663 lscgid (1156518): enter LVE (1003) : result: -22 !\n`);
    }
  };
  const raporty = () =>
    readdirSync(join(T, 'raporty')).sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
      .map((f) => JSON.parse(readFileSync(join(T, 'raporty', f), 'utf8')) as { stan: string; rodzaj: string; kroki: Array<{ krok: string; wynik: string }>; diagnoza: string; objaw: string; id: string });
  const wywolania = () => readFileSync(join(T, 'wywolania'), 'utf8');
  return { T, lsws, uruchom, bledyLve, raporty, wywolania, rebootow: () => (existsSync(join(T, 'reboot')) ? readFileSync(join(T, 'reboot'), 'utf8').trim().split('\n').length : 0) };
}

describe('verris-straznik — strażnik węzła', () => {
  it('pierwszy przebieg nie traktuje starych błędów jako nowej awarii; dziennik systemowy ustawiony jako trwały', () => {
    const w = wezel();
    w.bledyLve(10);
    expect(w.uruchom().status).toBe(0);
    expect(w.raporty()).toEqual([]);
    expect(w.wywolania()).not.toContain('lswsctrl restart');
    expect(existsSync(join(w.T, 'journal'))).toBe(true);
    // t1 13.10 16:25: po przeniesieniu dziennika na dysk rsyslog przestał pisać — odświeżamy go od razu.
    expect(w.wywolania()).toContain('systemctl try-restart rsyslog.service');
    w.uruchom();
    expect(w.wywolania().match(/try-restart rsyslog/g)).toHaveLength(1);
  });

  it('rsyslog działa, a /var/log/messages milczy i wpis kontrolny nie dociera: restart rsyslog, raport „naprawiono”', () => {
    const w = wezel();
    w.uruchom(); // pierwszy przebieg (trwały dziennik) za nami — jak na t1 i t2
    writeFileSync(join(w.T, 'messages'), 'Oct 13 16:25:08 t1 systemd[1]: Started verris-straznik.timer\n');
    const godzineTemu = new Date(Date.now() - 3600_000);
    utimesSync(join(w.T, 'messages'), godzineTemu, godzineTemu);
    writeFileSync(join(w.T, 'rsyslog-naprawialny'), '');
    w.uruchom();
    const r = w.raporty().pop()!;
    expect(r).toMatchObject({ rodzaj: 'rsyslog', stan: 'naprawiono' });
    expect(r.objaw).toContain('60 min temu');
    expect(r.kroki.map((k) => [k.krok, k.wynik])).toEqual([['diagnoza', 'zapisana'], ['restart rsyslog', 'plik znów rośnie']]);
    expect(w.wywolania()).toContain('systemctl restart rsyslog');
    // Następny przebieg: plik świeży — bez kolejnej kontroli ani restartu.
    const ile = w.wywolania().match(/systemctl restart rsyslog/g)!.length;
    w.uruchom();
    expect(w.wywolania().match(/systemctl restart rsyslog/g)).toHaveLength(ile);
  });

  it('rsyslog: świeży plik albo wpis kontrolny dociera — bez restartu; restart nie pomaga — „nie_naprawiono”', () => {
    const swiezy = wezel();
    writeFileSync(join(swiezy.T, 'messages'), 'Oct 14 08:00:00 t1 systemd[1]: ok\n');
    swiezy.uruchom();
    expect(swiezy.wywolania()).not.toContain('logger');
    expect(swiezy.wywolania()).not.toContain('systemctl restart rsyslog');

    const cichy = wezel();
    writeFileSync(join(cichy.T, 'messages'), 'stary wpis\n');
    const dawno = new Date(Date.now() - 3600_000);
    utimesSync(join(cichy.T, 'messages'), dawno, dawno);
    writeFileSync(join(cichy.T, 'rsyslog-pisze'), '');
    cichy.uruchom();
    expect(cichy.wywolania()).toContain('logger -t verris-straznik');
    expect(cichy.wywolania()).not.toContain('systemctl restart rsyslog');
    expect(cichy.raporty()).toEqual([]);

    const zepsuty = wezel();
    zepsuty.uruchom();
    writeFileSync(join(zepsuty.T, 'messages'), 'stary wpis\n');
    utimesSync(join(zepsuty.T, 'messages'), dawno, dawno);
    zepsuty.uruchom();
    expect(zepsuty.raporty().pop()).toMatchObject({ rodzaj: 'rsyslog', stan: 'nie_naprawiono' });
  });

  it('LVE konta (t1 13.10): diagnoza przed zmianą, restart LiteSpeed naprawia, sprawdzenie strony konta, raport „naprawiono”', () => {
    const w = wezel({ naprawa: 'lsws' });
    w.uruchom();
    w.bledyLve(3);
    expect(w.uruchom().status).toBe(0);
    const r = w.raporty();
    expect(r.map((x) => x.stan)).toEqual(['naprawa', 'naprawiono']);
    expect(r[0].rodzaj).toBe('lve');
    expect(r[0].objaw).toContain('3 błędów w logu LiteSpeed');
    expect(r[0].diagnoza).toContain('== LiteSpeed stderr');
    expect(r[1].kroki.map((k) => k.krok)).toEqual(['diagnoza', '1. restart LiteSpeed', 'sprawdzenie d3.hvln.pl']);
    expect(r[1].kroki[2].wynik).toBe('HTTP 200 — OK');
    expect(w.wywolania()).not.toContain('cagefsctl --force-update');
    expect(w.rebootow()).toBe(0);
    // Ta sama drabina nie rusza znowu przez 30 min (bez pętli napraw).
    w.bledyLve(5);
    w.uruchom();
    expect(w.raporty()).toHaveLength(2);
  });

  it('nie pomógł restart LiteSpeed → odświeżenie CageFS', () => {
    const w = wezel({ naprawa: 'cagefs' });
    w.uruchom();
    w.bledyLve(3);
    w.uruchom();
    const ost = w.raporty().pop()!;
    expect(ost.stan).toBe('naprawiono');
    expect(ost.kroki.map((k) => k.krok)).toContain('2. odświeżenie CageFS + restart LiteSpeed');
    expect(w.wywolania()).toContain('cagefsctl --force-update');
  });

  it('stan jądra LVE, nic nie pomaga: restart węzła za zgodą panelu, raport przed restartem, kontrola po starcie', () => {
    const w = wezel({ naprawa: 'nigdy', restartWezla: true });
    w.uruchom();
    w.bledyLve(3);
    writeFileSync(join(w.T, 'dmesg'), 'LVE: [1163] init_lve: subsys 0 lve1003 err -17\nLVE: [1938534] _lve_enter: Can\'t alloc ve #1003 lvp #0, rc -22\n');
    w.uruchom();
    expect(w.rebootow()).toBe(1);
    expect(w.raporty().map((x) => x.stan)).toEqual(['naprawa', 'restart']);
    expect(w.raporty()[1].kroki.pop()!.krok).toBe('3. restart węzła');
    // Po starcie węzła: strona działa → to samo zdarzenie zamknięte jako „naprawiono”.
    writeFileSync(join(w.T, 'kody'), '200');
    w.uruchom();
    const r = w.raporty();
    expect(r[r.length - 1]).toMatchObject({ stan: 'naprawiono', id: r[0].id });
    expect(r[r.length - 1].kroki.pop()).toMatchObject({ krok: 'po restarcie węzła', wynik: 'strony działają' });
  });

  it('bez zgody panelu, bez błędów jądra albo drugi raz w dobie: bez restartu węzła, „nie_naprawiono” z powodem', () => {
    const bezZgody = wezel({ naprawa: 'nigdy', restartWezla: false });
    bezZgody.uruchom();
    bezZgody.bledyLve(3);
    writeFileSync(join(bezZgody.T, 'dmesg'), 'init_lve: subsys 0 lve1003 err -17\n');
    bezZgody.uruchom();
    expect(bezZgody.rebootow()).toBe(0);
    expect(bezZgody.raporty().pop()).toMatchObject({ stan: 'nie_naprawiono' });

    const bezJadra = wezel({ naprawa: 'nigdy', restartWezla: true });
    bezJadra.uruchom();
    bezJadra.bledyLve(3);
    bezJadra.uruchom();
    expect(bezJadra.rebootow()).toBe(0);
    expect(bezJadra.raporty().pop()!.kroki.pop()!.wynik).toContain('brak błędów jądra');

    const swiezo = wezel({ naprawa: 'nigdy', restartWezla: true, uptime: 600 });
    swiezo.uruchom();
    swiezo.bledyLve(3);
    writeFileSync(join(swiezo.T, 'dmesg'), 'init_lve: subsys 0 lve1003 err -17\n');
    swiezo.uruchom();
    expect(swiezo.rebootow()).toBe(0);
    expect(swiezo.raporty().pop()!.kroki.pop()!.wynik).toContain('krócej niż 30 min');
  });

  it('seria 503 jednej strony (bez LVE): restart LiteSpeed; pojedyncze 503 nie są awarią', () => {
    const w = wezel({ naprawa: 'lsws' });
    w.uruchom();
    const linia = (d: string) => `2026-10-13 04:46:00.0 [NOTICE] [1] [T0] [1.2.3.4:5#APVH_www.${d}:443] oops! 503 Service Unavailable\n`;
    appendFileSync(join(w.lsws, 'logs', 'error.log'), linia('jedna.pl').repeat(2));
    w.uruchom();
    expect(w.raporty()).toEqual([]);
    appendFileSync(join(w.lsws, 'logs', 'error.log'), linia('d3.hvln.pl').repeat(6));
    w.uruchom();
    const r = w.raporty();
    expect(r.map((x) => [x.rodzaj, x.stan])).toEqual([['strony', 'naprawa'], ['strony', 'naprawiono']]);
    expect(r[0].objaw).toContain('d3.hvln.pl');
  });

  it('usługa włączona, a nie działa: start; nie wstała — „nie_naprawiono”', () => {
    const w = wezel({ jednostki: ['exim', 'dovecot'] });
    writeFileSync(join(w.T, 'stan-exim'), 'failed');
    writeFileSync(join(w.T, 'start-dziala'), '');
    w.uruchom();
    expect(w.raporty().pop()).toMatchObject({ rodzaj: 'usluga:exim', stan: 'naprawiono' });
    expect(w.wywolania()).toContain('systemctl start exim');
    expect(w.wywolania()).not.toContain('systemctl start dovecot');

    const z = wezel({ jednostki: ['mariadb'] });
    writeFileSync(join(z.T, 'stan-mariadb'), 'failed');
    z.uruchom();
    expect(z.raporty().pop()).toMatchObject({ rodzaj: 'usluga:mariadb', stan: 'nie_naprawiono' });
  });

  it('dysk ≥ 95%: tylko alarm, bez czyszczenia', () => {
    const w = wezel();
    writeFileSync(join(w.T, 'dysk'), '97');
    w.uruchom();
    expect(w.raporty().pop()).toMatchObject({ rodzaj: 'dysk', stan: 'tylko_alarm', objaw: 'Dysk / zajęty w 97%.' });
  });

  it('--sprawdz (po aktualizacji): ok przy zdrowym węźle, błąd z powodem przy LVE w jądrze i 503 strony', () => {
    const w = wezel();
    writeFileSync(join(w.T, 'kody'), '200');
    const ok = w.uruchom('--sprawdz');
    expect([ok.status, ok.stdout.trim()]).toEqual([0, 'VERRIS_STRAZNIK_SPRAWDZ=ok']);
    writeFileSync(join(w.T, 'dmesg'), 'init_lve: subsys 0 lve1003 err -17\n');
    writeFileSync(join(w.T, 'kody'), '503');
    const zle = w.uruchom('--sprawdz');
    expect(zle.status).toBe(1);
    expect(zle.stdout).toContain('LVE: 1 błędów w jądrze');
    expect(zle.stdout).toContain('strona d3.hvln.pl: HTTP 503');
    expect(w.wywolania()).not.toContain('lswsctrl restart');
  });
});
