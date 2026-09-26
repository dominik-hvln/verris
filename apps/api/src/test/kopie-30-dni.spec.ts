import { readFileSync } from 'fs';
import { join } from 'path';
import { KOPIE_OFFSITE_DNI } from '@verris/contracts';

/**
 * H-04 — obietnica „kopia z każdego z ostatnich 30 dni” (panel i verris.pl) musi zgadzać się z tym, ile
 * wersji faktycznie trzyma węzeł (RETENTION_DAYS w node-offsite-backup.sh). Inna liczba w skrypcie niż
 * w panelu to obietnica bez pokrycia albo kopie, o których klient nie wie.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');

describe('kopie poza serwerem — 30 dni', () => {
  it('RETENTION_DAYS w skrypcie węzła = KOPIE_OFFSITE_DNI', () => {
    const skrypt = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-offsite-backup.sh'), 'utf8');
    expect(skrypt).toContain(`RETENTION_DAYS="\${RETENTION_DAYS:-${KOPIE_OFFSITE_DNI}}"`);
  });

  it('verris.pl mówi o tej samej liczbie dni', () => {
    const cennik = readFileSync(join(KORZEN, 'apps', 'www', 'src', 'app', '(frontend)', 'components', 'Pricing.tsx'), 'utf8');
    expect(cennik).toContain(`ostatnich ${KOPIE_OFFSITE_DNI} dni`);
  });
});
