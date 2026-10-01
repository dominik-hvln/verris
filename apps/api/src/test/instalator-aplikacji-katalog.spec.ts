import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bladZadaniaDlaKlienta } from '../subscriptions/blad-zadania.js';
import { CATALOG, katalogPaneluPrestaShop } from '../subscriptions/app-install.service.js';

/**
 * I-01 — katalog aplikacji w API i instalator na węźle mówią jednym głosem, a domyślna strona Verris
 * nie blokuje instalacji ani nie zasłania aplikacji (index.html jest przed index.php w DirectoryIndex).
 */
const skrypt = (n: string) => readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', n), 'utf8');

describe('I-01 — instalator aplikacji', () => {
  const s = skrypt('node-app-install.sh');

  it.each(Object.keys(CATALOG))('%s: jest gałąź instalatora na węźle', (slug) => {
    expect(s).toMatch(new RegExp(`^\\s+${slug}\\)\\s`, 'm'));
  });

  it('PrestaShop: paczka z najnowszego stabilnego wydania, które ją ma (9.x na GitHubie jest bez paczek — t1 01.10)', () => {
    const f = s.slice(s.indexOf('install_prestashop() {'), s.indexOf('install_joomla() {'));
    expect(f).not.toContain('releases/latest/download/prestashop.zip');
    const py = f.match(/python3 -c '\n([\s\S]*?)'\)"/)![1];
    const wydania = [
      { tag_name: '9.2.0', prerelease: false, assets: [] },
      { tag_name: '9.2.0-rc.1', prerelease: true, assets: [{ name: 'prestashop_9.2.0.zip', browser_download_url: 'zle' }] },
      { tag_name: '8.2.8', prerelease: false, assets: [
        { name: 'prestashop_8.2.8.xml', browser_download_url: 'xml' },
        { name: 'prestashop_8.2.8.zip', browser_download_url: 'https://github.com/PrestaShop/PrestaShop/releases/download/8.2.8/prestashop_8.2.8.zip' },
      ] },
    ];
    const r = spawnSync('python3', ['-c', py], { input: JSON.stringify(wydania), encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('https://github.com/PrestaShop/PrestaShop/releases/download/8.2.8/prestashop_8.2.8.zip');
    // startowy index.php z paczki usuwany PRZED rozpakowaniem właściwych plików (inaczej ginął index.php sklepu)
    expect(f.indexOf('rm -f index.php Install_PrestaShop.html')).toBeLessThan(f.indexOf('unzip -q -o prestashop.zip'));
  });

  it('pobranie paczki dociągane od miejsca zerwania (t1 01.10: MediaWiki — serwer zrywa po ~70 s)', () => {
    const f = s.slice(s.indexOf('pobierz() {'), s.indexOf('\n}\n', s.indexOf('pobierz() {')));
    expect(f).toMatch(/for i in [\d ]+; do\n\s+curl -fsSL -C - "\$1" -o "\$tmp" && break/);
    expect(f).toContain('blad "Nie udało się pobrać paczki');
    expect(s.match(/run_as "[^"]*curl /g)).toBeNull();
    expect(s.match(/^\s+pobierz "\$url" \/tmp\/\S+$/gm)).toHaveLength(4);
  });

  it('PrestaShop: katalog panelu z węzła = adres panelu pokazany klientowi (bez „/admin”, którego sklep nie wpuszcza)', () => {
    const f = s.slice(s.indexOf('install_prestashop() {'), s.indexOf('install_joomla() {'));
    const wzor = f.match(/panel="admin\$\((.*)\)"/)![1];
    const r = spawnSync('bash', ['-c', `APP_DB_NAME='klient_pres1a2b' APP_ADMIN_PASS='Ha$lo!x' ; echo "admin$(${wzor})"`], { encoding: 'utf8' });
    expect(`/${r.stdout.trim()}`).toBe(katalogPaneluPrestaShop('klient_pres1a2b', 'Ha$lo!x'));
    expect(katalogPaneluPrestaShop('klient_pres1a2b', 'Ha$lo!x')).toMatch(/^\/admin[0-9a-f]{10}$/);
    expect(f.indexOf("rm -rf install && mv admin")).toBeGreaterThan(f.indexOf('index_cli.php'));
  });

  it('oficjalne instalatory CLI: Joomla (joomla.php install -n) i MediaWiki (run.php install)', () => {
    expect(s).toContain("installation/joomla.php install -n");
    expect(s).toContain('maintenance/run.php install');
    expect(s).toMatch(/--installdbuser=.*--installdbpass=/s);
  });

  it('domyślna strona Verris: nie blokuje instalacji, a znika dopiero po udanej instalacji', () => {
    expect(s).toContain(String.raw`POMIN='^(index\.html|\.htaccess|\.well-known|assets)$'`);
    const koniec = s.slice(s.lastIndexOf('esac'));
    expect(koniec.indexOf('usun_strone_domyslna')).toBeGreaterThan(0);
    expect(koniec.indexOf('usun_strone_domyslna')).toBeLessThan(koniec.indexOf('Gotowe'));
    expect(skrypt('node-wp-install.sh')).toContain('Usunięto domyślną stronę Verris');
  });

  // Test D3 29.09 (test2.d3.hvln.pl): świeża domena w DA 1.710 ma puste cgi-bin i katalog z nazwą domeny
  // — instalacja Joomli była przerywana, a klient dostawał tylko „Operacja nie powiodła się”.
  const sprawdz = (przygotuj: (d: string) => void) => {
    const d = mkdtempSync(join(tmpdir(), 'app-'));
    przygotuj(d);
    const start = s.indexOf('DOMYSLNA=0');
    const koniec = s.indexOf('\nfi\n', s.indexOf('ZAJETE=')) + 4;
    const bezZmian = s.split('\n').find((l) => l.startsWith('bez_zmian() {')) ?? '';
    const r = spawnSync('bash', ['-c', `log() { echo "[app-install] $*"; }\n${bezZmian}\nDOCROOT=${JSON.stringify(d)}\n${s.slice(start, koniec)}\necho DALEJ`], { encoding: 'utf8' });
    return r.stdout;
  };
  const domyslna = (d: string) => {
    writeFileSync(join(d, 'index.html'), '<title>x — hosting verris</title>');
    mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'assets', 'logo.svg'), '<svg/>');
    // DA 1.710 (t1, 29.09): cgi-bin z samym .htaccess „Options -Indexes”.
    mkdirSync(join(d, 'cgi-bin'));
    writeFileSync(join(d, 'cgi-bin', '.htaccess'), 'Options -Indexes\n');
    mkdirSync(join(d, 'test2.d3.hvln.pl'));
  };

  it('świeża domena (domyślna strona, cgi-bin od DirectAdmina i katalog domeny) → instalacja rusza', () => {
    expect(sprawdz(domyslna)).toContain('DALEJ');
  });

  it('bez strony domyślnej i z pustym cgi-bin też rusza', () => {
    expect(sprawdz((d) => mkdirSync(join(d, 'cgi-bin')))).toContain('DALEJ');
  });

  it('cgi-bin z czymkolwiek poza szkieletem DirectAdmina → przerwanie', () => {
    expect(sprawdz((d) => { domyslna(d); writeFileSync(join(d, 'cgi-bin', 'skrypt.pl'), '#!/usr/bin/perl'); })).not.toContain('DALEJ');
    expect(sprawdz((d) => { domyslna(d); writeFileSync(join(d, 'cgi-bin', '.htaccess'), 'Options +ExecCGI\nAddHandler cgi-script .pl\n'); })).not.toContain('DALEJ');
  });

  // Test D3 30.09: Joomla rozpakowana, instalator CLI odrzucił PHP 8.2 — pliki zostały, ponowienie blokowane.
  const instalacja = (d: string, root: string, poZmianach: string) => {
    const start = s.indexOf('DOMYSLNA=0');
    const koniec = s.indexOf('trap wycofaj EXIT') + 'trap wycofaj EXIT'.length;
    const fragment = s.slice(start, koniec).replace('"/home/${APP_DA_USER}/"', JSON.stringify(`${root}/u1/`));
    const bezZmian = s.split('\n').find((l) => l.startsWith('bez_zmian() {')) ?? '';
    return spawnSync('bash', ['-c', `set -Eeuo pipefail\nlog() { echo "[app-install] $*"; }\n${bezZmian}\nAPP_DA_USER=u1\nDOCROOT=${JSON.stringify(d)}\n${fragment}\n${poZmianach}`], { encoding: 'utf8' });
  };
  const konto = () => {
    const root = mkdtempSync(join(tmpdir(), 'konta-'));
    const d = join(root, 'u1', 'domains', 'x.pl', 'public_html');
    mkdirSync(d, { recursive: true });
    domyslna(d);
    return { root, d };
  };
  const zmiany = 'echo x > "$DOCROOT/index.php"; mkdir "$DOCROOT/installation"; echo zmiana > "$DOCROOT/index.html"; rm -rf "$DOCROOT/assets"';

  it('nieudana instalacja: katalog wraca 1:1, znacznik bez_zmian (API usuwa bazę), komunikat dla klienta', () => {
    const { root, d } = konto();
    const przed = readdirSync(d).sort();
    const r = instalacja(d, root, `${zmiany}; false`);
    expect(r.status).not.toBe(0);
    expect(readdirSync(d).sort()).toEqual(przed);
    expect(readFileSync(join(d, 'index.html'), 'utf8')).toContain('hosting verris');
    expect(readFileSync(join(d, 'cgi-bin', '.htaccess'), 'utf8')).toBe('Options -Indexes\n');
    expect(r.stdout).toContain('[VERRIS_APP] bez_zmian=1');
    expect(bladZadaniaDlaKlienta('exit 1', r.stdout)).toContain('katalog domeny jest taki jak przed instalacją');
  });

  it('konkretny błąd dla klienta (np. za stare PHP) wygrywa z ogólnym', () => {
    const { root, d } = konto();
    const r = instalacja(d, root, `${zmiany}; blad "Najnowsza Joomla wymaga PHP 8.3 lub nowszego"`);
    expect(bladZadaniaDlaKlienta('exit 1', r.stdout)).toBe('Najnowsza Joomla wymaga PHP 8.3 lub nowszego');
    expect(readdirSync(d)).not.toContain('index.php');
  });

  it('udana instalacja zostaje, bez znacznika', () => {
    const { root, d } = konto();
    const r = instalacja(d, root, zmiany);
    expect(r.status).toBe(0);
    expect(readdirSync(d)).toContain('index.php');
    expect(r.stdout).not.toContain('bez_zmian');
  });

  it('katalog domeny poza katalogiem konta (dowiązanie) → odmowa przed zmianami', () => {
    const { root } = konto();
    const obcy = mkdtempSync(join(tmpdir(), 'obcy-'));
    const r = instalacja(obcy, root, zmiany);
    expect(r.status).not.toBe(0);
    expect(readdirSync(obcy)).toEqual([]);
  });

  it('Joomla: wymóg PHP z paczki sprawdzany przed instalatorem CLI', () => {
    const j = s.slice(s.indexOf('install_joomla() {'), s.indexOf('install_mediawiki() {'));
    expect(j.indexOf('JOOMLA_MINIMUM_PHP')).toBeGreaterThan(0);
    expect(j.indexOf('JOOMLA_MINIMUM_PHP')).toBeLessThan(j.indexOf('installation/joomla.php install'));
  });

  it('prawdziwe pliki strony → przerwanie z komunikatem dla klienta, bez ścieżek węzła', () => {
    const out = sprawdz((d) => { domyslna(d); writeFileSync(join(d, 'index.php'), '<?php echo 1;'); });
    expect(out).not.toContain('DALEJ');
    const dlaKlienta = bladZadaniaDlaKlienta('exit 1', out);
    expect(dlaKlienta).toContain('W katalogu domeny są już pliki strony');
    expect(dlaKlienta).not.toContain('/home/');
    expect(out).toContain('[VERRIS_APP] bez_zmian=1');
  });
});
