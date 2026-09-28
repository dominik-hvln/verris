import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Decyzje 28.09 dla węzła:
 *  - firewalld + nftables + fail2ban zamiast CSF (instalator DA z DA_SKIP_CSF, jaile przejmują rolę LFD),
 *  - worker migracji: wszystko, co łączy się z serwerem PODANYM PRZEZ KLIENTA, jako verris-mig (nie root);
 *    import bazy na poświadczeniach bazy docelowej; hasła poza argv (widoczne w `ps` dla wszystkich kont).
 * Zachowanie sprawdzone na żywo (sshd + MariaDB 10.11 + prawdziwe konta): pliki trafiają do konta
 * z właścicielem klienta, prawa zachowane, `\!` i DROP innej bazy w strumieniu importu odrzucone.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');
const kod = (p: string) => czytaj(p).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

describe('węzeł — firewall bez CSF', () => {
  it('bootstrap instaluje DirectAdmina bez CSF', () => {
    expect(czytaj('apps/api/src/servers/node-bootstrap.script.ts')).toMatch(/export DA_SKIP_CSF=true/);
  });

  it('baseline węzła włącza jaile fail2ban dla DA, Exima, Dovecota i Pure-FTPd', () => {
    const b = czytaj('ops/scripts/security-hardening-baseline.sh');
    for (const j of ['directadmin', 'exim', 'dovecot', 'pure-ftpd']) expect(b).toContain(`[${j}]\nenabled = true`);
    expect(b).toContain('logpath = /var/log/directadmin/login.log');
    expect(b).toContain('logpath = /var/log/exim/mainlog');
  });
});

describe('worker migracji — bez roota przy obcych serwerach', () => {
  const w = kod('ops/scripts/node-migration-worker.sh');

  it.each(['sshpass -e rsync', 'lftp --env-password', 'mysqldump --single-transaction', 'imapsync', 'curl -sSk', 'curl -sS --fail'])(
    '%s działa jako verris-mig',
    (narzedzie) => {
      // Wywołania narzędzia (bez listy zależności, instalacji, logów i polecenia wykonywanego ZDALNIE przez ssh).
      const linie = w
        .split('\n')
        .filter((l) => l.includes(narzedzie) && !/command -v|--help|need=|IFS= read|imapsync_|--version|log "|echo "/.test(l));
      expect(linie.length).toBeGreaterThan(0);
      for (const l of linie) expect(l).toMatch(/jako_mig/);
    },
  );

  it('hasła nie trafiają do argv', () => {
    expect(w).not.toMatch(/sshpass -p/);
    expect(w).not.toMatch(/--password1|--password2/);
    expect(w).not.toMatch(/MYSQL_PWD="\$spass"|MYSQL_PWD=\$\(printf/);
    expect(w).toMatch(/--passfile1 "\$pf1"/);
  });

  it('import bazy nie idzie przez root-socket do bazy docelowej', () => {
    expect(w).not.toMatch(/\|\s*mysql --protocol=socket "\$tdb"/);
    expect(w).toMatch(/importuj=\(jako_mig_env MYSQL_PWD "\$tgt_pf" mysql --protocol=socket \$\{sandbox:\+"\$sandbox"\} -u "\$tuser" "\$tdb"\)/);
  });

  it('pliki do konta kopiuje sam klient, nie root', () => {
    expect(w).toMatch(/runuser -u "\$user" -- rsync -a --delete/);
    expect(w).not.toMatch(/chown -R "\$\{user\}:\$\{user\}" "\$dst"[^\n]*\n[^\n]*\n[^\n]*local bytes files/);
  });

  it('mysqldump z MariaDB: --set-gtid-purged tylko gdy klient go zna', () => {
    expect(w).toMatch(/grep -q -- '--set-gtid-purged' && gtid=\(--set-gtid-purged=OFF\)/);
    expect(w).not.toMatch(/--no-tablespaces --set-gtid-purged=OFF/);
  });

  it('katalog domowy starego konta nie trafia do public_html', () => {
    expect(w).toMatch(/pod="domains\/\$\{domain\}\/public_html"/);
    expect(w).toMatch(/ODMOWA: katalog źródłowy wygląda na katalog domowy konta/);
  });

  it('dane bazy z wp-config.php czyta klient (dowiązanie do pliku roota nie wycieknie)', () => {
    expect(w).toMatch(/runuser -u "\$user" -- head -c 262144 "\$f"/);
    expect(w).not.toMatch(/(cat|head|grep|perl)[^\n|]*wp-config\.php/);
  });

  it('eksport bazy przez PHP: token, jednorazowość, HTTPS bez przekierowań, znacznik końca', () => {
    expect(w).toMatch(/hash_equals\(\\\$token, \\\$_POST\['t'\]\)/);
    expect(w).toMatch(/@unlink\(__FILE__\);\n@set_time_limit/);
    expect(w).toMatch(/--proto =https --tlsv1\.2 --max-redirs 0/);
    expect(w).not.toMatch(/curl[^\n]*(-L |--location|-k )[^\n]*verris-export|nazwa\}"[^\n]*-k/);
    expect(w).toMatch(/--data "@\$sek\/token"/);
    expect(w).toMatch(/grep -q 'VERRIS-EXPORT-OK'/);
    expect(w).toMatch(/jako_mig cat "\$sek\/zrzut\.sql" \| oczysc_zrzut \| "\$\{importuj\[@\]\}"/);
  });

  it('tryb ręczny obsługi: hasła z zapytania, domena musi należeć do konta, te same ścieżki co automat', () => {
    expect(w).toMatch(/reczna\) shift; ensure_deps; reczna "\$@" ;;/);
    expect(w).toMatch(/read -r -s -p "\$1: " h <\/dev\/tty/);
    expect(w).toMatch(/grep -qxF "\$domena" "\$lista"/);
    expect(w).toMatch(/run_files "\$job" "\$log"; rc=\$\?/);
    expect(czytaj('docs/ops/MIGRATOR_V2.md')).toContain('## Migracja ręczna — instrukcja dla obsługi');
  });

  it('drain nie pobiera skryptu imapsync co 2 minuty', () => {
    expect(w).toMatch(/\[ "\$tryb" = pelne \] \|\| return 0/);
  });
});
