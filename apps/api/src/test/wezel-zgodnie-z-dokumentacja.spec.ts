import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Skrypty węzła po audycie z oficjalną dokumentacją DirectAdmin / CloudLinux (2026-09-25) i poprawce
 * eskalacji przez dowiązania symboliczne w katalogu klienta. Pilnuje, żeby wadliwe wzorce nie wróciły.
 */
const SKRYPTY = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts');
// Bez linii komentarzy — opisują, co było wcześniej, i nie są wykonywane.
const czytaj = (plik: string) =>
  readFileSync(join(SKRYPTY, plik), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

describe('skrypty węzła — katalog klienta tylko jako klient', () => {
  it.each(['node-wp-install.sh', 'node-wp-update.sh', 'node-staging-sync.sh', 'node-site-clone.sh'])(
    '%s: wp-cli w ~/.verris zapisywany przez klienta, bez chmod/chown/curl -o roota na jego ścieżce',
    (plik) => {
      const t = czytaj(plik);
      expect(t).toContain('wp_cli_jako_klient');
      expect(t).not.toMatch(/chmod [0-7]{3} "\$WP_PHAR"|chmod 755 "\$(WP_DIR|VERRIS_DIR)"/);
      expect(t).not.toMatch(/-o "\$\{?WP_PHAR\}?\.tmp"/);
      expect(t).not.toMatch(/chown[^\n]*"\$(WP_PHAR|VERRIS_DIR)"/);
    },
  );

  // Test D3 30.09: kopia WordPressa z prefiksem Redis źródła czytała jego cache (adresy starej domeny).
  it.each([
    ['node-site-clone.sh', /config set "\$c" "\$SC_TARGET:"/, 'search-replace "//www.$SC_SOURCE"'],
    ['node-staging-sync.sh', /config set \$c '\$\{STAGING_HOST\}:'/, "search-replace '://${STG_DOMAIN}'"],
  ])('%s: kopia WordPressa dostaje własny prefiks Redis po imporcie bazy', (plik, prefiks, poImporcie) => {
    const t = czytaj(plik);
    expect(t).toMatch(/for c in WP_REDIS_PREFIX WP_CACHE_KEY_SALT/);
    expect(t).toMatch(prefiks);
    expect(t.search(prefiks)).toBeGreaterThan(t.indexOf(poImporcie));
  });

  it('Memcached: po uruchomieniu instancji włącza rozszerzenie PHP memcached dla bieżącej wersji konta', () => {
    const t = czytaj('node-memcached.sh');
    expect(t).toMatch(/selectorctl --user-current --user="\$MC_DA_USER"/);
    expect(t).toMatch(/selectorctl --enable-user-extensions=memcached --version="\$WERSJA" --user="\$MC_DA_USER"/);
    expect(t.indexOf('--enable-user-extensions=memcached')).toBeGreaterThan(t.indexOf('Memcached działa dla'));
  });

  it('utwardzanie węzła: fail2ban włączony w CustomBuild (przy fail2ban=no CustomBuild go usuwa — t1 29.09)', () => {
    const t = czytaj('security-hardening-baseline.sh');
    expect(t).toContain('da build set fail2ban yes && da build fail2ban');
    expect(t.indexOf('da build set fail2ban yes')).toBeGreaterThan(t.indexOf('dnf install -y fail2ban'));
    expect(t.indexOf('dnf install -y fail2ban-firewalld')).toBeGreaterThan(t.indexOf('da build fail2ban'));
  });

  it('profil: Exim BlockCracking włączony przez CustomBuild (decyzja 01.10)', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('da build set blockcracking yes && da build blockcracking');
    expect(t).toContain('cb_option_value blockcracking');
  });

  it('profil: aplikacje Python przez LiteSpeed — skrypt producenta i kontrola lswsgi (t1 01.10: 503)', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('/usr/local/lsws/admin/misc/enable_ruby_python_selector.sh');
    expect(t).toMatch(/\/lswsgi"/);
    expect(t.indexOf('enable_ruby_python_selector.sh')).toBeGreaterThan(t.indexOf('--selector-status enabled'));
  });

  it('zmiana PHP konta włącza OPcache dla wybranej wersji, chyba że klient go wyłącza', () => {
    const t = czytaj('node-php-apply.sh');
    expect(t).toMatch(/selectorctl --enable-user-extensions=opcache --version="\$PHP_VERSION" --user="\$PHP_DA_USER"/);
    expect(t).toContain('",opcache,"');
  });

  it('WAF: .htaccess edytowany przez klienta (runuser), nie przez roota', () => {
    const t = czytaj('node-waf-apply.sh');
    expect(t).toMatch(/runuser -u "\$WAF_DA_USER"/);
    expect(t).not.toMatch(/^touch "\$HTACCESS"|>> "\$HTACCESS"|chown [^\n]*"\$HTACCESS"/m);
  });

  it('pobranie kopii off-site do katalogu klienta: bez podążania za dowiązaniem', () => {
    const t = czytaj('node-account-restore.sh');
    expect(t).toContain('chown -h');
    expect(t).toMatch(/\[ ! -L "\$\{dst\}\$\{archive\}" \]/);
  });
});

describe('skrypty węzła — polecenia z oficjalnej dokumentacji', () => {
  it('kopia off-site: directadmin admin-backup, nie niedokumentowany task.queue user_select0', () => {
    const t = czytaj('node-offsite-backup.sh');
    expect(t).toMatch(/"\$DA_BIN" admin-backup --destination="\$adir" --user="\$user"/);
    expect(t).not.toContain('user_select0');
  });

  it('restore: format task.queue z dokumentacji (value=multiple, owner = administrator)', () => {
    const t = czytaj('node-account-restore.sh');
    expect(t).toMatch(/action=restore&%s&local_path=%s&owner=%s&select0=%s&type=admin&value=multiple&when=now&where=local/);
    // IP z archiwum, a na innym węźle (H-16) ip_choice=select&ip= — oba warianty z dokumentacji DA.
    expect(t).toContain('local ipchoice="ip_choice=file"');
    expect(t).toContain('ipchoice="ip_choice=select&ip=${ip}"');
  });

  it('PHP: selectorctl --set-user-current (nie --set-current-version), bez fałszywego sukcesu', () => {
    const t = czytaj('node-php-apply.sh');
    expect(t).toContain('--set-user-current=');
    expect(t).not.toContain('--set-current-version');
    expect(t).not.toContain('task.queue');
  });

  it.each(['node-htaccess.sh', 'node-php-info.sh', 'node-site-stats.sh'])(
    '%s: strona klienta przez IP konta z user.conf (vhosty DA są przypięte do IP), nie przez 127.0.0.1',
    (plik) => {
      const t = czytaj(plik);
      expect(t).toContain('/usr/local/directadmin/data/users/');
      expect(t).toMatch(/IP_KONTA/);
      expect(t).not.toMatch(/(HEALTH_BASE|HTTP_BASE)="\$\{[A-Z_]+:-http:\/\/127\.0\.0\.1\}"/);
      expect(t).not.toMatch(/--resolve "[^"]*:127\.0\.0\.1"/);
    },
  );

  it('.htaccess: zmiana PHP sprawdzana plikiem .php z oczekiwaną wersją, inaczej poprzedni plik wraca', () => {
    const t = czytaj('node-htaccess.sh');
    expect(t).toContain('VERRIS-PHP');
    expect(t).toMatch(/if \[ "\$ODP" != "VERRIS-PHP \$CEL" \]; then\n\s+zapisz "\$TMP\/stary"/);
    // t1 29.09: jedna natychmiastowa próba cofała działającą zmianę — kilka prób, https przy przekierowaniu,
    // kod i początek odpowiedzi w dzienniku zadania
    expect(t).toMatch(/for proba in 1 2 3 4 5 6; do/);
    expect(t).toContain('--resolve "$HT_DOMAIN:443:$IP_KONTA"');
    expect(t).toContain('[htaccess] sonda PHP: HTTP');
  });

  it('profil: handlery alt-phpXX w LiteSpeed (<phpConfig><phpHandler>) po instalacji alt-php, z kopią i restartem', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('configure_litespeed_alt_php');
    expect(t).toMatch(/configure_hosting_capabilities\nconfigure_litespeed_alt_php/);
    expect(t).toContain('<id>alt-php%s</id>');
    expect(t).toContain('/opt/alt/php%s/usr/bin/lsphp');
  });

  it('profil: Composer dla SSH (C-28, t1 02.10 „command not found”) — oficjalny phar z sumą SHA-256, przed odświeżeniem CageFS', () => {
    const t = czytaj('node-hosting-profile.sh');
    const i = t.indexOf('https://getcomposer.org/download/latest-stable/composer.phar ');
    expect(i).toBeGreaterThan(0);
    expect(t).toContain('composer.phar.sha256sum');
    expect(t).toMatch(/sha256sum -c --quiet -/);
    expect(t).toContain('install -m 0755 -o root -g root "$ctmp" /usr/local/bin/composer');
    expect(i).toBeLessThan(t.indexOf('"$bin" --force-update'));
    // t1 02.10: sama instalacja nie wystarczyła — /usr/local/bin poza klatką; wpis CageFS przed odświeżeniem
    const cfg = t.indexOf('/etc/cagefs/conf.d/verris-composer.cfg');
    expect(cfg).toBeGreaterThan(0);
    expect(t).toContain('paths=/usr/local/bin/composer');
    expect(cfg).toBeLessThan(t.indexOf('"$bin" --force-update'));
  });

  it('profil: G-21 Per-Client Throttling w httpd_config.xml (blok z t1 02.10) — wartości, kopia, idempotencja', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toMatch(/configure_litespeed_alt_php\nconfigure_litespeed_throttling\n/);
    const py = /<<'PY_THROTTLE'\n([\s\S]*?)\nPY_THROTTLE\n/.exec(t)![1];
    const dir = mkdtempSync(join(tmpdir(), 'lsws-'));
    const conf = join(dir, 'httpd_config.xml');
    const blok = (s: string, d: string, soft: string, hard: string, ban: string) =>
      `<security>\n    <perClientConnLimit>\n      <staticReqPerSec>${s}</staticReqPerSec>\n      <dynReqPerSec>${d}</dynReqPerSec>\n      <outBandwidth>0</outBandwidth>\n      <inBandwidth>0</inBandwidth>\n      <softLimit>${soft}</softLimit>\n      <hardLimit>${hard}</hardLimit>\n      <gracePeriod>15</gracePeriod>\n      <banPeriod>${ban}</banPeriod>\n    </perClientConnLimit>\n    <CGIRLimit>\n      <maxCGIInstances>200</maxCGIInstances>\n    </CGIRLimit>\n</security>\n`;
    writeFileSync(conf, blok('0', '0', '10000', '10000', '300'));
    const env = { ...process.env, STATIC: '0', DYN: '20', SOFT: '100', HARD: '150', GRACE: '15', BAN: '60' };
    const uruchom = () => spawnSync('python3', ['-', conf, join(dir, 'brak.cagefs')], { input: py, env, encoding: 'utf8' });
    const r = uruchom();
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('1');
    expect(readFileSync(conf, 'utf8')).toBe(blok('0', '20', '100', '150', '60'));
    expect(uruchom().stdout.trim()).toBe('0'); // drugi przebieg nic nie zmienia — bez zbędnego restartu LSWS
    writeFileSync(conf, '<security></security>\n');
    expect(uruchom().status).not.toBe(0); // brak bloku = błąd, nie cichy sukces
    expect(spawnSync('python3', ['-', conf], { input: py, env: { ...env, DYN: '20; rm' }, encoding: 'utf8' }).status).not.toBe(0);
  });

  it('profil: webmail i phpMyAdmin jednym kliknięciem (one_click_*_login, Roundcube z direct_login)', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('da_set_conf one_click_webmail_login 1');
    expect(t).toContain('da_set_conf one_click_pma_login 1');
    expect(t).toContain('da build roundcube');
    // DA 1.710: moduł leży w /var/www/html/roundcube/direct_login (formularz CMD_WEBMAIL_LOGIN), nie w plugins/
    expect(t).toContain('/var/www/html/roundcube/direct_login');
    expect(t).not.toContain('roundcube/plugins/direct_login');
  });

  it('profil: DA nie mailuje klientów — konta DA na lokalny alias :blackhole:, stary adres zachowany, kontrola exim -bt', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('verris-da-powiadomienia');
    expect(t).toContain(':blackhole:');
    expect(t).toContain("grep -q '^usertype=user$'");
    expect(t).toContain('verris_email_klienta=');
    expect(t).toMatch(/exim -bt "\$DA_SINK"/);
    // „Message System” wysyła kopię na adres z ticket.conf, nie z user.conf (retest D3 29.09)
    expect(t).toContain('tc="${uc%/user.conf}/ticket.conf"');
    expect(t).toMatch(/kont ma w ticket\.conf adres inny/);
  });

  it('profil: antyspam — rspamd wg dokumentacji DA, gdy żaden spamd nie działa; pakiety z catchall=ON', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('da build set spamd rspamd');
    expect(t).toContain('da build exim_conf');
    expect(czytaj('node-da-sync-plan-packages.sh')).toContain('catchall=ON');
  });

  it('profil: alt-php z repo php-els (CL10) i sprawdzenie każdej wersji w selektorze, bez OK na ślepo', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('els-php-release');
    expect(t).toMatch(/groupinstall -y "alt-php\$\{v\/\.\/\}"/);
    expect(t).toMatch(/for v in \$\{VERRIS_PHP_VERSIONS:-8\.3 8\.2 8\.1 8\.0 7\.4\}/);
    expect(t).toContain('log_fail "PHP Selector: brak wersji');
  });

  it('profil węzła: ModSecurity budowane, default_ttl zamiast dns_ttl, składnia CustomBuild 2', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toMatch(/"\$BUILD" modsecurity/);
    expect(t).not.toContain('modsecurity_enabled');
    expect(t).not.toMatch(/da_set_conf dns_ttl/);
    expect(t).not.toMatch(/\$BUILD build (clean|php)/);
  });

  it('LVE: lvectl --maxEntryProcs (opcja z dokumentacji CloudLinux), nie --ep', () => {
    const t = czytaj('verris-lve.sh');
    expect(t.match(/"--maxEntryProcs=%d"/g)).toHaveLength(2);
    expect(t).not.toContain('"--ep=');
  });

  it('certyfikat hostname: DirectAdmin letsencrypt.sh server_cert, bez kopiowania certbota do conf/', () => {
    const t = czytaj('node-directadmin-tls-http01.sh');
    expect(t).toContain('"$DA/scripts/letsencrypt.sh" server_cert');
    expect(t).not.toMatch(/certbot|cacert\.pem|cakey\.pem/);
  });

  it('MariaDB: dane da_admin z my.cnf DA, przy MySQL Governor mysqlgovernor.py krok po kroku', () => {
    const t = czytaj('node-db-upgrade.sh');
    expect(t).toContain('--defaults-extra-file="$MYCNF"');
    expect(t).toMatch(/"\$DUMP_BIN" "\$\{MYA\[@\]\}" --all-databases/);
    expect(t).toMatch(/"\$GOV" --mysql-version="\$GOV_CEL"/);
    expect(t).toContain('governor_step_by_step');
  });

  it('expose_php = Off: alt-php przez global_php.ini [Global PHP Settings] + selectorctl --apply-global-php-ini (CloudLinux KB)', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('/etc/cl.selector/global_php.ini');
    expect(t).toContain('[Global PHP Settings]');
    expect(t).toContain('selectorctl --apply-global-php-ini');
    expect(t).toMatch(/^configure_php_expose$/m);
  });

  it('CustomBuild: opcje czytane z options.conf', () => {
    expect(czytaj('node-hosting-profile.sh')).toContain('"$CB/options.conf"');
  });

  it('rsync w CageFS (cagefsctl --addrpm) — staging kopiuje pliki jako klient (t1 01.10: rsync: command not found)', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toMatch(/"\$bin" --addrpm rsync/);
    // --force-update po dodaniu pakietu, inaczej skeleton go nie ma
    expect(t.indexOf('--addrpm rsync')).toBeLessThan(t.indexOf('"$bin" --force-update'));
    const s = czytaj('node-staging-sync.sh');
    expect(s).toContain("as_user 'command -v rsync'");
    expect(s).toMatch(/'\$\{from\}\/' '\$\{to\}\/'" \|\| die "/);
  });
});

describe('profil węzła — panel DA (:2222) tylko z control-plane (decyzja 2026-09-29)', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  // Same definicje funkcji (bez wywołań od require_root) — uruchamiane w bashu na atrapach csf/firewall-cmd.
  const DIR = mkdtempSync(join(tmpdir(), 'da-panel-'));
  writeFileSync(join(DIR, 'fn.sh'), surowy.slice(0, surowy.indexOf('\nrequire_root\n')));
  for (const bin of ['csf', 'firewall-cmd']) {
    writeFileSync(join(DIR, bin), `#!/bin/sh\necho "${bin} $*" >> "${DIR}/wywolania"\n`);
    chmodSync(join(DIR, bin), 0o755);
  }
  const CONF = 'TCP_IN = "20,21,22,2222,80"\nTCP6_IN = "2222,443"\nUDP_IN = "53"\n';
  const przygotuj = () => {
    writeFileSync(join(DIR, 'csf.conf'), CONF);
    writeFileSync(join(DIR, 'csf.allow'), '192.0.2.1 # cudzy wpis\n');
    writeFileSync(join(DIR, 'wywolania'), '');
  };
  const uruchom = (env: Record<string, string>) => {
    const r = spawnSync('bash', ['-c', `. "${DIR}/fn.sh"; configure_da_panel_firewall`], {
      // CSF_LOG w katalogu testu: w CI (bez roota) /var/log jest tylko do odczytu i przekierowanie
      // blokowało samo csf -r (lokalnie jako root test przechodził).
      env: { ...process.env, PATH: `${DIR}:${process.env.PATH}`, CSF_DIR: DIR, CSF_LOG: join(DIR, 'csf.log'), ...env },
      encoding: 'utf8',
    });
    return {
      rc: r.status,
      out: r.stdout + r.stderr,
      conf: readFileSync(join(DIR, 'csf.conf'), 'utf8'),
      allow: readFileSync(join(DIR, 'csf.allow'), 'utf8'),
      wywolania: readFileSync(join(DIR, 'wywolania'), 'utf8'),
    };
  };

  it('pusty VERRIS_CONTROL_PLANE_IPS → [WARN] i zero zmian zapory (także przy samym VERRIS_DA_ADMIN_ALLOW)', () => {
    przygotuj();
    const r = uruchom({ VERRIS_CONTROL_PLANE_IPS: ' , ', VERRIS_DA_ADMIN_ALLOW: '198.51.100.7' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('[WARN] VERRIS_CONTROL_PLANE_IPS pusty');
    expect(r.wywolania).toBe('');
    expect(r.conf).toBe(CONF);
    expect(r.allow).toBe('192.0.2.1 # cudzy wpis\n');
  });

  it('nieprawidłowy adres → [FAIL] i zero zmian', () => {
    przygotuj();
    const r = uruchom({ VERRIS_CONTROL_PLANE_IPS: '203.0.113.10;reboot' });
    expect(r.out).toContain('[FAIL] Nieprawidłowy adres');
    expect(r.wywolania).toBe('');
    expect(r.conf).toBe(CONF);
  });

  it('CSF: 2222 znika z TCP_IN/TCP6_IN, allow tylko dla control-plane i operatora, idempotentnie, cudze wpisy zostają', () => {
    przygotuj();
    const env = { VERRIS_CONTROL_PLANE_IPS: '203.0.113.10, 2001:db8::/64', VERRIS_DA_ADMIN_ALLOW: '198.51.100.7' };
    uruchom(env);
    const r = uruchom(env);
    expect(r.conf).toBe('TCP_IN = "20,21,22,80"\nTCP6_IN = "443"\nUDP_IN = "53"\n');
    expect(r.allow).toBe(
      '192.0.2.1 # cudzy wpis\n' +
        '# verris-da-panel BEGIN — panel DA tylko z control-plane (zarządza profil Verris, nie edytuj)\n' +
        'tcp|in|d=2222|s=198.51.100.7\ntcp|in|d=2222|s=2001:db8::/64\ntcp|in|d=2222|s=203.0.113.10\n' +
        '# verris-da-panel END\n',
    );
    expect(r.wywolania).toBe('csf -r\n'); // drugie uruchomienie bez zmian = bez przeładowania
    expect(r.out).toContain('[OK] CSF: panel DA :2222 tylko z: 198.51.100.7,2001:db8::/64,203.0.113.10');
  });

  it('kontrola po zmianie: log_fail, gdy 2222 dalej w TCP_IN; firewalld: reject z ujemnym priorytetem', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('log_fail "CSF: ${DA_PANEL_PORT} nadal w TCP_IN/TCP6_IN');
    expect(t).toContain('rule priority=\\"-100\\" port port=\\"${DA_PANEL_PORT}\\" protocol=\\"tcp\\" reject');
    expect(t).toMatch(/^configure_da_panel_firewall$/m);
  });
});

describe('profil węzła — strona zawieszonego konta (white label)', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  const html = /<<'VERRIS_SUSPENDED'\n([\s\S]*?)\nVERRIS_SUSPENDED\n/.exec(surowy)?.[1] ?? '';

  it('samodzielna strona po polsku z marką Verris: noindex, bez nazwy DirectAdmin i zasobów zewnętrznych', () => {
    expect(html).toContain('<html lang="pl">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<p class="marka">Verris</p>');
    expect(html).toContain('Ta strona jest tymczasowo niedostępna.');
    expect(html).toContain(
      'Jeśli jesteś właścicielem, zaloguj się do panelu Verris (<a href="https://panel.verris.pl" rel="nofollow">panel.verris.pl</a>), aby sprawdzić status usługi.',
    );
    expect(html).not.toMatch(/directadmin/i);
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|url\(|@import/i);
  });

  it('wdrożenie wg DA: custom/suspended + kopie admina/resellerów zapisywane jako ich właściciel, z kontrolą', () => {
    const t = czytaj('node-hosting-profile.sh');
    expect(t).toContain('dst="$tpl/custom/suspended"');
    expect(t).toContain('runuser -u "$u" --');
    expect(t).toContain('[ ! -L "$f" ]');
    expect(t).toContain('log_fail "Strona zawieszenia');
    expect(t).toMatch(/^configure_suspended_page$/m);
  });
});


describe('profil węzła — liczenie ticket.conf bez adresu-zlewu (t1 29.09: profil przerwany przez pipefail)', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  const DIR = mkdtempSync(join(tmpdir(), 'da-sink-'));
  writeFileSync(join(DIR, 'fn.sh'), surowy.slice(0, surowy.indexOf('\nrequire_root\n')));
  const konto = (u: string, typ: string, email: string) => {
    mkdirSync(join(DIR, 'users', u), { recursive: true });
    writeFileSync(join(DIR, 'users', u, 'user.conf'), `usertype=${typ}\n`);
    writeFileSync(join(DIR, 'users', u, 'ticket.conf'), `email=${email}\n`);
  };
  const policz = () =>
    spawnSync('bash', ['-c', `. "${DIR}/fn.sh"; da_zle_ticket_conf "${DIR}/users" zlew@t1; echo koniec`], { encoding: 'utf8' });

  it('admin bez zlewu (ostatni na liście) nie przerywa skryptu pod set -Eeuo pipefail', () => {
    konto('aaklient', 'user', 'zlew@t1');
    konto('zzadmin', 'admin', 'admin@example.com');
    const r = policz();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('0\nkoniec\n');
  });

  it('klient z własnym adresem jest liczony', () => {
    konto('bbklient', 'user', 'klient@example.com');
    expect(policz().stdout).toBe('1\nkoniec\n');
  });
});

describe('profil węzła — HTTP/3: UDP 443 w zaporze (J-04, retest D3 29.09)', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  const DIR = mkdtempSync(join(tmpdir(), 'http3-'));
  writeFileSync(join(DIR, 'fn.sh'), surowy.slice(0, surowy.indexOf('\nrequire_root\n')));
  // Atrapa firewall-cmd: stan portu w pliku, zapis wywołań.
  writeFileSync(join(DIR, 'firewall-cmd'), `#!/bin/sh
echo "$*" >> "${DIR}/wywolania"
case "$*" in
  --state) exit 0 ;;
  *--add-port=443/udp*) touch "${DIR}/udp443"; exit 0 ;;
  *--query-port=443/udp*) [ -f "${DIR}/udp443" ] ;;
  *) exit 0 ;;
esac
`);
  chmodSync(join(DIR, 'firewall-cmd'), 0o755);
  const uruchom = () =>
    spawnSync('bash', ['-c', `. "${DIR}/fn.sh"; configure_http3_firewall`], {
      env: { ...process.env, PATH: `${DIR}:${process.env.PATH}`, CSF_DIR: join(DIR, 'brak-csf') },
      encoding: 'utf8',
    });

  it('firewalld bez UDP 443 → dodaje, przeładowuje, [OK]; drugi raz bez zmian', () => {
    const r1 = uruchom();
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('[OK] firewalld: UDP 443 otwarty');
    const w1 = readFileSync(join(DIR, 'wywolania'), 'utf8');
    expect(w1).toContain('--permanent --add-port=443/udp');
    expect(w1).toContain('--reload');
    writeFileSync(join(DIR, 'wywolania'), '');
    const r2 = uruchom();
    expect(r2.stdout).toContain('[OK] firewalld: UDP 443 otwarty');
    expect(readFileSync(join(DIR, 'wywolania'), 'utf8')).not.toContain('--add-port');
  });

  it('profil wywołuje krok po zaporze panelu DA', () => {
    expect(surowy).toMatch(/^configure_da_panel_firewall\nconfigure_http3_firewall$/m);
  });
});

describe('phpMyAdmin bez nazwy serwera DirectAdmina (test D3 29.09: „DA PMA SignOn”)', () => {
  const funkcja = () => {
    const pelny = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
    const start = pelny.indexOf('configure_pma_white_label() {');
    const koniec = pelny.indexOf('\n}\n', pelny.indexOf('log_ok "phpMyAdmin', start));
    return pelny.slice(start, koniec + 3);
  };
  const KONFIG = [
    '<?php', '$i = 0;', '$i++;', "if (isset($_COOKIE['SignonSession'])) {",
    "\t$cfg['Servers'][$i]['auth_type'] = 'signon';", "\t$cfg['Servers'][$i]['SignonURL'] = 'sso_logout.php';",
    '}', "$cfg['Servers'][$i]['host'] = 'localhost';", "// $cfg['Servers'][$i]['controlhost'] = '';", '',
  ].join('\n');
  const uruchom = (konfig: string | null) => {
    const t = mkdtempSync(join(tmpdir(), 'pma-'));
    if (konfig !== null) {
      mkdirSync(join(t, 'www', 'phpMyAdmin'), { recursive: true });
      writeFileSync(join(t, 'www', 'phpMyAdmin', 'config.inc.php'), konfig);
    }
    const skrypt = [
      'log_ok(){ echo "OK $*"; }; log_warn(){ echo "WARN $*"; }; log_fail(){ echo "FAIL $*"; }; DRY_RUN=0; PREFLIGHT_ONLY=0',
      funkcja().replaceAll('/var/www/html', join(t, 'www')).replaceAll('/usr/local/directadmin', join(t, 'da')),
      'configure_pma_white_label', 'configure_pma_white_label',
    ].join('\n');
    const r = spawnSync('bash', ['-c', skrypt], { encoding: 'utf8' });
    return { t, out: r.stdout + r.stderr, cfg: () => readFileSync(join(t, 'www', 'phpMyAdmin', 'config.inc.php'), 'utf8') };
  };

  it('SignonScript w bloku SSO, własna nazwa serwera, kopia w custombuild/custom, bez duplikatów przy powtórce', () => {
    const r = uruchom(KONFIG);
    const cfg = r.cfg();
    expect(r.out).not.toMatch(/FAIL|WARN/);
    expect(cfg.match(/VERRIS-PMA/g)).toHaveLength(2);
    expect(cfg).toMatch(/SignonURL[^\n]*\n[^\n]*VERRIS-PMA[^\n]*\n\tif \(@is_readable\('[^']*\/\.verris\/pma-signon\.php'\)\) \{ \$cfg\['Servers'\]\[\$i\]\['SignonScript'\]/);
    expect(cfg).toContain("$cfg['Servers'][$i]['verbose'] = 'Bazy danych'; // VERRIS-PMA");
    expect(readFileSync(join(r.t, 'da', 'custombuild', 'custom', 'phpmyadmin', 'config.inc.php'), 'utf8')).toBe(cfg);
    const php = readFileSync(join(r.t, 'www', '.verris', 'pma-signon.php'), 'utf8');
    expect(php).toContain('function get_login_credentials');
    expect(php).not.toContain('cfgupdate\']');
    expect(readFileSync(join(r.t, 'www', '.verris', '.htaccess'), 'utf8')).toBe('Require all denied\n');
  });

  it('nierozpoznany config.inc.php → bez zmian i FAIL; brak phpMyAdmina → tylko ostrzeżenie', () => {
    const r = uruchom('<?php\n$cfg = [];\n');
    expect(r.out).toContain('FAIL phpMyAdmin');
    expect(r.cfg()).toBe('<?php\n$cfg = [];\n');
    expect(uruchom(null).out).toContain('WARN phpMyAdmin');
  });
});

it('profil zamyka Cockpit (9090) w firewalld — test D3 29.09: „services: cockpit” w strefie public', () => {
  const t = czytaj('node-hosting-profile.sh');
  expect(t).toContain('firewall-cmd --permanent --remove-service=cockpit');
  expect(t).toMatch(/\nconfigure_firewall_cockpit\n/);
});

it('domyślna strona domeny nie pokazuje loginu konta (test D3 29.09: „Konto: ovsekucx” dla każdego odwiedzającego)', () => {
  const html = readFileSync(join(SKRYPTY, '..', 'hosting-default-page', 'index.html'), 'utf8');
  expect(html).not.toContain('|USERNAME|');
});

describe('profil węzła — konto master Dovecota dla migracji poczty (E-21, t1 03.10: rc=2 bez konta)', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  const DIR = mkdtempSync(join(tmpdir(), 'dovecot-master-'));
  writeFileSync(join(DIR, 'fn.sh'), surowy.slice(0, surowy.indexOf('\nrequire_root\n')));
  const DD = join(DIR, 'dovecot');
  mkdirSync(join(DD, 'conf.d'), { recursive: true });
  // Atrapa doveconf -n: „konfiguracja” = treść conf.d; ODRZUC = Dovecot nie przyjmuje.
  writeFileSync(join(DIR, 'doveconf'), `#!/bin/sh\n[ -f "${DIR}/ODRZUC" ] && exit 1\ncat "${DD}"/conf.d/*.conf 2>/dev/null\n`);
  writeFileSync(join(DIR, 'systemctl'), `#!/bin/sh\necho "$*" >> "${DIR}/wywolania"\n`);
  for (const b of ['doveconf', 'systemctl']) chmodSync(join(DIR, b), 0o755);
  const VCONF = join(DIR, 'verris.conf');
  const uruchom = () =>
    spawnSync('bash', ['-c', `. "${DIR}/fn.sh"; configure_dovecot_migration_master`], {
      env: { ...process.env, PATH: `${DIR}:${process.env.PATH}`, VERRIS_DOVECOT_DIR: DD, VERRIS_CONF_FILE: VCONF },
      encoding: 'utf8',
    });

  it('worker czyta z /etc/verris.conf te same zmienne, które profil zapisuje; profil woła krok po throttlingu', () => {
    expect(surowy).toMatch(/configure_litespeed_throttling\nconfigure_dovecot_migration_master\n/);
    const worker = readFileSync(join(SKRYPTY, 'node-migration-worker.sh'), 'utf8');
    expect(worker).toContain('VERRIS_DOVECOT_MASTER_USER');
    expect(worker).toContain('VERRIS_DOVECOT_MASTER_PASS');
  });

  it('zakłada konto raz: hasło w verris.conf (0600), skrót w passwd-file tylko z localhost, passdb master', () => {
    writeFileSync(VCONF, "VERRIS_SERVER_ID='s1'\n");
    const r = uruchom();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK] Dovecot: konto master migracji poczty');
    const conf = readFileSync(VCONF, 'utf8');
    const haslo = /^VERRIS_DOVECOT_MASTER_PASS='([0-9a-f]{48})'$/m.exec(conf)![1];
    expect(conf).toContain("VERRIS_DOVECOT_MASTER_USER='verris-migracja'");
    expect(spawnSync('stat', ['-c', '%a', VCONF], { encoding: 'utf8' }).stdout.trim()).toBe('600');
    const users = readFileSync(join(DD, 'verris-master-users'), 'utf8');
    expect(users).toMatch(/^verris-migracja:\{SHA512-CRYPT\}\$6\$[^:]+::::::allow_nets=127\.0\.0\.1\/32,::1\/128\n$/);
    expect(users).not.toContain(haslo);
    const pd = readFileSync(join(DD, 'conf.d', '91-verris-migracja.conf'), 'utf8');
    expect(pd).toContain('passdb verris-migracja {');
    expect(pd).toMatch(/master = yes\n\s+result_success = continue/);
    expect(readFileSync(join(DIR, 'wywolania'), 'utf8')).toContain('reload dovecot');

    // Drugi przebieg: to samo hasło (worker i Dovecot zgodne), bez drugiego wpisu.
    uruchom();
    const conf2 = readFileSync(VCONF, 'utf8');
    expect(conf2.match(/VERRIS_DOVECOT_MASTER_PASS=/g)).toHaveLength(1);
    expect(conf2).toContain(haslo);
  });

  it('Dovecot odrzuca konfigurację → plik conf.d usunięty, [FAIL]', () => {
    writeFileSync(join(DIR, 'ODRZUC'), '');
    spawnSync('rm', ['-f', join(DD, 'conf.d', '91-verris-migracja.conf')]);
    const r = uruchom();
    expect(r.stderr).toContain('[FAIL] Dovecot nie przyjął');
    expect(spawnSync('test', ['-e', join(DD, 'conf.d', '91-verris-migracja.conf')]).status).not.toBe(0);
  });
});

describe('profil węzła — Python bez lswsgi (t1 03.10: python314 → 503)', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  const start = surowy.indexOf('        brak="" wylaczone=""');
  const koniec = surowy.indexOf('\n        fi\n', start) + '\n        fi\n'.length;
  const blok = surowy.slice(start, koniec);
  const DIR = mkdtempSync(join(tmpdir(), 'lswsgi-'));
  const ALT = join(DIR, 'alt');
  // python313 z lswsgi, python314 bez; atrapy dnf (pakiet niedostępny) i cloudlinux-selector (zapis wywołań).
  for (const nazwa of ['python313', 'python314']) {
    mkdirSync(join(ALT, nazwa, 'bin'), { recursive: true });
    writeFileSync(join(ALT, nazwa, 'bin', 'python3'), '', { mode: 0o755 });
  }
  writeFileSync(join(ALT, 'python313', 'bin', 'lswsgi'), '');
  chmodSync(join(ALT, 'python313', 'bin', 'lswsgi'), 0o755);
  writeFileSync(join(DIR, 'dnf'), `#!/bin/sh\necho "dnf $*" >> "${DIR}/wywolania"\nexit 1\n`);
  writeFileSync(join(DIR, 'cloudlinux-selector'), `#!/bin/sh\necho "cls $*" >> "${DIR}/wywolania"\n[ -f "${DIR}/CLS_BLAD" ] && exit 1\nexit 0\n`);
  for (const b of ['dnf', 'cloudlinux-selector']) chmodSync(join(DIR, b), 0o755);
  const uruchom = () =>
    spawnSync('bash', ['-c', `log_ok(){ echo "[OK] $*"; }; log_warn(){ echo "[WARN] $*"; }; f(){ ${blok} }; f`], {
      // VERRIS_APP_LOG w katalogu testu: w CI (bez roota) /var/log jest tylko do odczytu — przekierowanie
      // nie powiodłoby się i selektor „odmówiłby” (CI 03.10, lokalnie jako root przechodziło).
      env: { ...process.env, PATH: `${DIR}:${process.env.PATH}`, VERRIS_ALT_DIR: ALT, VERRIS_APP_LOG: join(DIR, 'app.log'), HOME: DIR },
      encoding: 'utf8',
    });

  it('brakujący lswsgi: najpierw pakiet CloudLinux, potem wyłączenie wersji w selektorze → [OK] z listą', () => {
    writeFileSync(join(DIR, 'wywolania'), '');
    const r = uruchom();
    expect(r.stdout + r.stderr).toContain('[OK] Python przez LiteSpeed (lswsgi); bez lswsgi wyłączone w selektorze: 3.14');
    const w = readFileSync(join(DIR, 'wywolania'), 'utf8');
    expect(w).toContain('dnf install -y alt-python314-wsgi-lsapi');
    expect(w).toContain('cls disable-version --json --interpreter python --version 3.14');
    expect(w).not.toContain('python313');
  });

  it('selektor odmawia → [WARN] o 503 (nie udajemy sukcesu)', () => {
    writeFileSync(join(DIR, 'CLS_BLAD'), '');
    const r = uruchom();
    expect(r.stdout).toContain('[WARN] brak lswsgi dla: python314');
  });
});
