import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Noc 15.10 (przegląd node-root-files): `install-verris-default-page.sh --replace-existing` (operator ręcznie) znajdował
 * public_html ze stockową stroną, a potem ROOT robił w nim rsync, sed+mv index.html, chmod 755/644 i chown -R. Klient,
 * który zostawił w index.html słowo „directadmin”, mógł między wyszukaniem a zapisem podmienić public_html (albo assets,
 * index.html) na dowiązanie — root nadałby 755/644 dowolnemu plikowi i zapisał index.html w dowolnym katalogu.
 * Teraz root przygotowuje stronę we własnym katalogu tymczasowym, a do public_html wpisuje ją KLIENT (runuser + tar),
 * jak hak poddomen w tym samym skrypcie.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'install-verris-default-page.sh');
const SZABLON = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'hosting-default-page');

function uruchom(opcje: { hostnameBezI?: boolean } = {}) {
  const T = mkdtempSync(join(tmpdir(), 'strona-domyslna-'));
  const bin = join(T, 'bin');
  mkdirSync(bin);
  const pub = join(T, 'home', 'u1', 'domains', 'x.pl', 'public_html');
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, 'index.html'), '<p>Something amazing will be constructed here (DirectAdmin)</p>');
  const atrapy: Record<string, string> = {
    // rsync -a SRC/ DST/ (w kontenerze testów nie ma rsync); tar zamiast `cp -a dir/.` — zachowanie cp zależy od
    // implementacji coreutils hosta (CI 15.10 na ubuntu-26.04 był czerwony, lokalnie zielony).
    rsync: '#!/bin/bash\nsrc="${@: -2:1}"; dst="${@: -1}"\nmkdir -p "$dst" && tar -C "$src" -cf - . | tar -C "$dst" -xf -\n',
    // Atrapa zamiast hosta: wynik testu nie może zależeć od tego, czy `hostname` CI zna -I.
    hostname: opcje.hostnameBezI
      ? '#!/bin/bash\necho "hostname: invalid option -- I" >&2\nexit 1\n'
      : '#!/bin/bash\n[ "$1" = -I ] && echo "198.51.100.7 "\n',
    runuser: `#!/bin/bash\n[ "$1" = -u ] || exit 7\necho "$2 :: \${*:4}" >> "${T}/runuser.log"\nshift 3\nexec "$@"\n`,
    chown: `#!/bin/bash\necho "$*" >> "${T}/chown.log"\n`,
    id: '#!/bin/bash\n[ "$1" = "-u" ] && { echo 0; exit 0; }\nexit 0\n',
  };
  for (const [n, t] of Object.entries(atrapy)) {
    writeFileSync(join(bin, n), t);
    chmodSync(join(bin, n), 0o755);
  }
  const s = readFileSync(SKRYPT, 'utf8');
  // Funkcje skryptu bez części wykonawczej (od ostatniego „require_root”); /home → katalog testu.
  const funkcje = s.slice(0, s.lastIndexOf('\nrequire_root\n')).replaceAll('#^/home/', `#^${T}/home/`);
  // Z pliku, jak na węźle (nie `bash -c`): CI 15.10 na ubuntu-26.04 (bash 5.3) padał już na nagłówku skryptu —
  // bez pliku BASH_SOURCE jest puste, a `cd ""` w bash 5.3 to błąd (w 5.2 nie).
  const plik = join(T, 'skrypt-test.sh');
  writeFileSync(plik, `${funkcje}\nSRC_DIR=${JSON.stringify(SZABLON)}\nDRY_RUN=0\ndeploy_public_html ${JSON.stringify(pub)}\n`);
  const r = spawnSync('bash', [plik], {
    env: { PATH: `${bin}:${process.env.PATH ?? ''}` },
    encoding: 'utf8',
  });
  const czytaj = (n: string) => (existsSync(join(T, n)) ? readFileSync(join(T, n), 'utf8') : '');
  const wynik = { r, runuser: czytaj('runuser.log'), chown: czytaj('chown.log'), index: readFileSync(join(pub, 'index.html'), 'utf8'), assets: existsSync(join(pub, 'assets')) };
  rmSync(T, { recursive: true, force: true });
  return wynik;
}

describe('strona domyślna Verris — podmiana istniejącej strony zapisuje klient', () => {
  it('index.html i assets trafiają do public_html przez runuser (tar), bez chown roota; tokeny uzupełnione', () => {
    const w = uruchom();
    expect(w.r.status, w.r.stderr).toBe(0);
    expect(w.runuser).toMatch(/^u1 :: tar -C .*\/public_html -xpf - --no-same-owner/m);
    expect(w.chown).toBe('');
    expect(w.index).toContain('x.pl');
    expect(w.index).not.toContain('|DOMAIN|');
    expect(w.assets).toBe(true);
  });

  // CI 15.10 (ubuntu-26.04): `hostname` bez opcji -I przy `set -o pipefail` kończył skrypt kodem 1 przed podmianą strony.
  it('hostname bez -I (inna implementacja) nie przerywa podmiany — adres IP zostaje pusty', () => {
    const w = uruchom({ hostnameBezI: true });
    expect(w.r.status, w.r.stderr).toBe(0);
    expect(w.runuser).toMatch(/^u1 :: tar -C .*\/public_html -xpf -/m);
    expect(w.index).toContain('x.pl');
  });

  it('w deploy_public_html żadnego zapisu roota w katalogu klienta (rsync, chmod, chown, mv, sed)', () => {
    const s = readFileSync(SKRYPT, 'utf8');
    const f = s.slice(s.indexOf('deploy_public_html() {'), s.indexOf('\n}\n', s.indexOf('deploy_public_html() {')));
    for (const linia of f.split('\n')) {
      if (/pub_dir/.test(linia) && /\b(rsync|chmod|chown|mv|sed|cp|tar)\b/.test(linia)) expect(linia).toMatch(/runuser -u/);
    }
    expect(f).not.toMatch(/fix_public_html_permissions "\$\{?pub_dir/);
    expect(f).not.toMatch(/cleanup_public_html_artifacts "\$\{?pub_dir/);
  });
});
