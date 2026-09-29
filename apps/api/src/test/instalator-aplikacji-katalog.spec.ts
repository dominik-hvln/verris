import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bladZadaniaDlaKlienta } from '../subscriptions/blad-zadania.js';
import { CATALOG } from '../subscriptions/app-install.service.js';

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
    const r = spawnSync('bash', ['-c', `log() { echo "[app-install] $*"; }\nDOCROOT=${JSON.stringify(d)}\n${s.slice(start, koniec)}\necho DALEJ`], { encoding: 'utf8' });
    return r.stdout;
  };
  const domyslna = (d: string) => {
    writeFileSync(join(d, 'index.html'), '<title>x — hosting verris</title>');
    mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'assets', 'logo.svg'), '<svg/>');
    mkdirSync(join(d, 'cgi-bin'));
    mkdirSync(join(d, 'test2.d3.hvln.pl'));
  };

  it('świeża domena (domyślna strona, puste cgi-bin i katalog domeny) → instalacja rusza', () => {
    expect(sprawdz(domyslna)).toContain('DALEJ');
  });

  it('prawdziwe pliki strony → przerwanie z komunikatem dla klienta, bez ścieżek węzła', () => {
    const out = sprawdz((d) => { domyslna(d); writeFileSync(join(d, 'index.php'), '<?php echo 1;'); });
    expect(out).not.toContain('DALEJ');
    const dlaKlienta = bladZadaniaDlaKlienta('exit 1', out);
    expect(dlaKlienta).toContain('W katalogu domeny są już pliki strony');
    expect(dlaKlienta).not.toContain('/home/');
  });
});
