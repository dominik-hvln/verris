import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Skrypty węzła po audycie z oficjalną dokumentacją DirectAdmin / CloudLinux (2026-09-25) i poprawce
 * eskalacji przez dowiązania symboliczne w katalogu klienta. Pilnuje, żeby wadliwe wzorce nie wróciły.
 */
const SKRYPTY = join(__dirname, '..', '..', '..', '..', 'ops', 'scripts');
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

  it('CustomBuild: opcje czytane z options.conf', () => {
    expect(czytaj('node-hosting-profile.sh')).toContain('"$CB/options.conf"');
  });
});

