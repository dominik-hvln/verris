import { readFileSync } from 'fs';
import { join } from 'path';
import { CATALOG } from '../subscriptions/app-install.service';

/**
 * I-01 — katalog aplikacji w API i instalator na węźle mówią jednym głosem, a domyślna strona Verris
 * nie blokuje instalacji ani nie zasłania aplikacji (index.html jest przed index.php w DirectoryIndex).
 */
const skrypt = (n: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'ops', 'scripts', n), 'utf8');

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
});
