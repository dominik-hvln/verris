import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Paczka 128 (10.11.2026): ops/cron/verris-backup.cron co tydzień wołał ops/backup-verify.sh, usunięty w H-24 –
 * cotygodniowy test odtworzenia kopii po cichu nie działał. Każdy skrypt z repo wołany z crona musi istnieć.
 */
const KORZEN = join(__dirname, '..', '..', '..', '..');
const KATALOG = join(KORZEN, 'ops', 'cron');

describe('crony z ops/cron wołają istniejące skrypty', () => {
  const pliki = readdirSync(KATALOG).filter((f) => !f.startsWith('.'));

  it('jest co sprawdzać', () => {
    expect(pliki.length).toBeGreaterThan(0);
  });

  for (const plik of pliki) {
    it(plik, () => {
      const tresc = readFileSync(join(KATALOG, plik), 'utf8');
      const wywolania = [...tresc.matchAll(/\.\/(ops\/[A-Za-z0-9_./-]+\.sh)/g)].map((m) => m[1]);
      const brakujace = wywolania.filter((s) => !existsSync(join(KORZEN, s)));
      expect(brakujace).toEqual([]);
    });
  }

  it('test odtworzenia kopii woła jedyny drill (H-24)', () => {
    const cron = readFileSync(join(KATALOG, 'verris-backup.cron'), 'utf8');
    expect(cron).toContain('./ops/scripts/restore-drill-isolated.sh');
    expect(cron).not.toContain('backup-verify.sh');
  });
});
