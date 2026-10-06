import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Próba bety 06.10 — webmail (Roundcube z CustomBuild) był po angielsku i z logo Roundcube. Profil węzła
 * kładzie w custom/roundcube plugin marki (pakiet z control-plane) i konfigurację (szablon DA + blok Verris),
 * a Roundcube przebudowuje tylko po zmianie. Uruchamiamy prawdziwy fragment skryptu z atrapami `da` i `verris-fetch`.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PROFIL = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');
const FRAGMENT = PROFIL.slice(
  PROFIL.indexOf('  RC_DA='),
  PROFIL.indexOf('  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v da >/dev/null 2>&1; then\n    if [ ! -d /var/www/html/roundcube/direct_login ]'),
);

function wezel(opcje: { marka: boolean }) {
  const k = mkdtempSync(join(tmpdir(), 'rc-'));
  for (const d of ['bin', 'da/configure/roundcube/plugins', 'app/public_html', 'app/config']) mkdirSync(join(k, d), { recursive: true });
  writeFileSync(join(k, 'da/configure/roundcube/config.inc.php'), "<?php\n$config = [];\n$config['skin'] = 'elastic';\n");
  writeFileSync(join(k, 'da/configure/roundcube/plugins/readme-about-this-dir.md'), 'DA\n');
  writeFileSync(join(k, 'app/config/config.inc.php'), "$config['skin'] = 'elastic';\n");
  symlinkSync(join(k, 'app/public_html'), join(k, 'roundcube'));
  // `da build roundcube` jak CustomBuild: custom (albo szablon) + dopisana baza.
  writeFileSync(
    join(k, 'bin/da'),
    `#!/usr/bin/env bash\necho "da $*" >> "${k}/da.log"\nsrc="${k}/da/custom/roundcube/config.inc.php"; [ -f "$src" ] || src="${k}/da/configure/roundcube/config.inc.php"\n{ cat "$src"; echo "\\$config['db_dsnw'] = 'x';"; } > "${k}/app/config/config.inc.php"\n`,
  );
  writeFileSync(
    join(k, 'bin/verris-fetch'),
    opcje.marka
      ? `#!/usr/bin/env bash\ntar -czf "$2" -C "${join(KORZEN, 'ops/roundcube/verris_marka')}" .\n`
      : '#!/usr/bin/env bash\nexit 1\n',
  );
  writeFileSync(join(k, 'bin/hostname'), '#!/usr/bin/env bash\necho t9.verris.pl\n');
  for (const b of ['da', 'verris-fetch', 'hostname']) chmodSync(join(k, 'bin', b), 0o755);
  const przebieg = () => {
    const r = spawnSync('bash', ['-c', `log_ok() { echo "[OK] $*"; }\nlog_warn() { echo "[WARN] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\nDRY_RUN=0\nPREFLIGHT_ONLY=0\n${FRAGMENT}`], {
      encoding: 'utf8',
      // Log w katalogu testu — CI nie jest rootem, a nieudane przekierowanie do /var/log nie uruchamia `da`.
      env: { PATH: `${join(k, 'bin')}:${process.env.PATH}`, RC_DA: join(k, 'da'), RC_WWW: join(k, 'roundcube'), RC_LOG: join(k, 'roundcube.log') },
    });
    return r.stdout + r.stderr;
  };
  const czytaj = (p: string) => (existsSync(join(k, p)) ? readFileSync(join(k, p), 'utf8') : '');
  return { k, przebieg, czytaj };
}

describe('Profil węzła — webmail po polsku i w marce Verris', () => {
  it('pakiet marki + blok konfiguracji → jedna przebudowa, wynikowy config z marką, językiem i bazą', () => {
    const w = wezel({ marka: true });
    const wyjscie = w.przebieg();
    expect(w.czytaj('da.log').trim()).toBe('da build roundcube');
    const custom = w.czytaj('da/custom/roundcube/config.inc.php');
    expect(custom).toContain("$config['skin'] = 'elastic';");
    expect(custom).toContain("$config['language'] = 'pl_PL';");
    expect(custom).toContain("$config['plugins'][] = 'verris_marka';");
    expect(custom).toContain("'https://t9.verris.pl/roundcube/static.php/plugins/verris_marka/watermark.html'");
    // custom/plugins zastępuje configure/plugins — pliki DA zostają.
    expect(w.czytaj('da/custom/roundcube/plugins/readme-about-this-dir.md')).toBe('DA\n');
    expect(w.czytaj('da/custom/roundcube/plugins/verris_marka/verris_marka.php')).toContain('class verris_marka');
    expect(w.czytaj('app/config/config.inc.php')).toMatch(/Verris Poczta[\s\S]*db_dsnw/);
    expect(wyjscie).toContain('[OK] Webmail po polsku');
    expect(wyjscie).toContain('[OK] Webmail w marce Verris Poczta');
  });

  it('drugi przebieg bez zmian — bez przebudowy i bez podwójnego bloku', () => {
    const w = wezel({ marka: true });
    w.przebieg();
    w.przebieg();
    expect(w.czytaj('da.log').trim().split('\n')).toEqual(['da build roundcube']);
    expect(w.czytaj('da/custom/roundcube/config.inc.php').match(/>>> Verris/g)).toHaveLength(1);
  });

  it('bez pakietu marki — sam język, ostrzeżenie, bez pluginu w konfiguracji', () => {
    const w = wezel({ marka: false });
    const wyjscie = w.przebieg();
    const custom = w.czytaj('da/custom/roundcube/config.inc.php');
    expect(custom).toContain("'pl_PL'");
    expect(custom).not.toContain('verris_marka');
    expect(wyjscie).toContain('[WARN] Webmail: nie pobrano marki Verris');
    expect(wyjscie).toContain('[OK] Webmail po polsku');
  });
});
