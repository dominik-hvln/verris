import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { statystykiZLogu } from './site-stats.service';

/** PB-19 — skrypt węzła na prawdziwym formacie logu combined i drzewie WordPressa. */
const SKRYPT = join(__dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-site-stats.sh');
const MIES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function uruchom(pliki: Record<string, string>, log: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ss-'));
  const doc = join(dir, 'home', 'domains', 'a.pl', 'public_html');
  mkdirSync(doc, { recursive: true });
  for (const [p, t] of Object.entries(pliki)) {
    mkdirSync(join(doc, p, '..'), { recursive: true });
    writeFileSync(join(doc, p), t);
  }
  mkdirSync(join(dir, 'logs'));
  writeFileSync(join(dir, 'logs', 'a.pl.log'), log);
  const out = execFileSync('bash', [SKRYPT], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', SS_DA_USER: 'klient1', SS_DOMAIN: 'a.pl', SS_HOME: join(dir, 'home'),
      SS_JAKO_ROOT: '1', SS_SKIP_TTFB: '1', SS_LOG_DIR: join(dir, 'logs'),
    },
  });
  return statystykiZLogu(out)!;
}

describe('PB-19 — statystyki strony', () => {
  it('WordPress z wersją; ruch dzisiaj, 5xx bez parametrów w ścieżce, stare wpisy pominięte', () => {
    const d = new Date();
    const dzis = `${String(d.getDate()).padStart(2, '0')}/${MIES[d.getMonth()]}/${d.getFullYear()}`;
    const w = uruchom(
      { 'wp-includes/version.php': "<?php\n$wp_version = '6.8.2';\n" },
      `1.2.3.4 - - [${dzis}:10:00:00 +0200] "GET /?s=tajne HTTP/1.1" 200 12 "-" "UA"\n` +
        `5.6.7.8 - - [${dzis}:10:01:00 +0200] "POST /wp-admin/admin-ajax.php?token=x HTTP/1.1" 500 12 "-" "UA"\n` +
        `1.2.3.4 - - [01/Jan/2020:10:00:00 +0200] "GET / HTTP/1.1" 500 1 "-" "-"\n`,
    );
    expect(w.technologia).toEqual({ nazwa: 'WordPress', wersja: '6.8.2' });
    expect(w.ruch).toHaveLength(7);
    expect(w.ruch[6]).toMatchObject({ zadania: 2, odwiedzajacy: 2, bledy5xx: 1 });
    expect(w.top5xx).toEqual([{ sciezka: '/wp-admin/admin-ajax.php', liczba: 1 }]);
    expect(JSON.stringify(w)).not.toMatch(/tajne|token|1\.2\.3\.4/);
  });

  it('strona domyślna Verris rozpoznana; wynik z logu odporny na śmieci', () => {
    expect(uruchom({ 'index.html': '<title>a.pl — hosting verris</title>' }, '').technologia.nazwa).toBe('domyślna Verris');
    expect(statystykiZLogu('x')).toBeNull();
  });
});
