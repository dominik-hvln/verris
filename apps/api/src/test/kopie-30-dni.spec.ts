import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { KOPIE_OFFSITE_DNI, KOPIE_OFFSITE_MAX_DNI } from '@verris/contracts';
import { RetencjaOffsiteDto } from '../subscriptions/dto/hosting-body.dto.js';
import { BackupOffsiteDto } from '../servers/onboard.admin.controller.js';
import { CreatePlanDto, UpdatePlanDto } from '../plans/dto/plan.dto.js';

/**
 * H-04 — obietnica „kopia z każdego z ostatnich 30 dni” (panel i verris.pl) musi zgadzać się z tym, ile
 * wersji faktycznie trzyma węzeł (RETENTION_DAYS w node-offsite-backup.sh). Inna liczba w skrypcie niż
 * w panelu to obietnica bez pokrycia albo kopie, o których klient nie wie.
 *
 * H-03 — klient wybiera retencję w granicach planu; żadna warstwa (klient, plan, panel admina, baza, węzeł)
 * nie może zejść poniżej KOPIE_OFFSITE_DNI ani przekroczyć KOPIE_OFFSITE_MAX_DNI (Regulamin §10 ust. 8).
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const skrypt = () => readFileSync(join(KORZEN, 'ops', 'scripts', 'node-offsite-backup.sh'), 'utf8');
const bledy = (klasa: new () => object, v: Record<string, unknown>) =>
  validateSync(plainToInstance(klasa, v)).map((e) => e.property);

describe('kopie poza serwerem — 30 dni', () => {
  it('RETENTION_DAYS w skrypcie węzła = KOPIE_OFFSITE_DNI', () => {
    expect(skrypt()).toContain(`RETENTION_DAYS="\${RETENTION_DAYS:-${KOPIE_OFFSITE_DNI}}"`);
  });

  it('verris.pl mówi o tej samej liczbie dni', () => {
    const cennik = readFileSync(join(KORZEN, 'apps', 'www', 'src', 'app', '(frontend)', 'components', 'Pricing.tsx'), 'utf8');
    expect(cennik).toContain(`ostatnich ${KOPIE_OFFSITE_DNI} dni`);
  });

  it('pierwszy przebieg bez katalogu -versions/ nie zabija skryptu przed raportem (set -e + pipefail)', () => {
    const lsf = skrypt().split('\n').filter((l) => /rclone lsf/.test(l) && !/^\s*#/.test(l));
    expect(lsf.length).toBeGreaterThan(0);
    for (const l of lsf) expect(l).toMatch(/\|\| true/);
  });

  it('węzeł przycina każdą retencję (floty i kont) do [KOPIE_OFFSITE_DNI, KOPIE_OFFSITE_MAX_DNI]', () => {
    const s = skrypt();
    expect(s).toMatch(new RegExp(`^RETENCJA_MIN_DNI=${KOPIE_OFFSITE_DNI}$`, 'm'));
    expect(s).toMatch(new RegExp(`^RETENCJA_MAX_DNI=${KOPIE_OFFSITE_MAX_DNI}$`, 'm'));
    expect(s).toContain('RETENTION_DAYS="$(przytnij_dni "$RETENTION_DAYS")"');
    expect(s).toContain('RETENCJA[$u]="$(przytnij_dni "$d")"');
  });

  it('domyślna retencja konta i sufit planu w bazie = KOPIE_OFFSITE_DNI', () => {
    const schemat = readFileSync(join(KORZEN, 'libs', 'database', 'prisma', 'schema.prisma'), 'utf8');
    expect(schemat).toMatch(new RegExp(`offsiteRetentionDays\\s+Int\\s+@default\\(${KOPIE_OFFSITE_DNI}\\)`));
    expect(schemat).toMatch(new RegExp(`offsiteRetentionMaxDays\\s+Int\\s+@default\\(${KOPIE_OFFSITE_DNI}\\)`));
    const migracja = readFileSync(
      join(KORZEN, 'libs', 'database', 'prisma', 'migrations', '20260930120000_retencja_kopii_offsite', 'migration.sql'),
      'utf8',
    );
    expect(migracja).toContain(`"offsiteRetentionMaxDays" INTEGER NOT NULL DEFAULT ${KOPIE_OFFSITE_DNI}`);
    expect(migracja).toContain(`"offsiteRetentionDays" INTEGER NOT NULL DEFAULT ${KOPIE_OFFSITE_DNI}`);
  });

  it('klient, plan i panel admina nie przepuszczą retencji poniżej minimum ani powyżej sufitu', () => {
    const pod = KOPIE_OFFSITE_DNI - 1;
    const nad = KOPIE_OFFSITE_MAX_DNI + 1;
    expect(bledy(RetencjaOffsiteDto, { dni: pod })).toEqual(['dni']);
    expect(bledy(RetencjaOffsiteDto, { dni: nad })).toEqual(['dni']);
    expect(bledy(RetencjaOffsiteDto, { dni: KOPIE_OFFSITE_DNI })).toEqual([]);
    expect(bledy(UpdatePlanDto, { offsiteRetentionMaxDays: pod })).toEqual(['offsiteRetentionMaxDays']);
    expect(bledy(UpdatePlanDto, { offsiteRetentionMaxDays: nad })).toEqual(['offsiteRetentionMaxDays']);
    expect(bledy(UpdatePlanDto, { offsiteRetentionMaxDays: KOPIE_OFFSITE_MAX_DNI })).toEqual([]);
    expect(bledy(CreatePlanDto, { offsiteRetentionMaxDays: pod })).toContain('offsiteRetentionMaxDays');
    const admin = { host: 'u1.your-storagebox.de', port: 23, user: 'u1', sciezka: 'verris' };
    expect(bledy(BackupOffsiteDto, { ...admin, retencjaDni: pod })).toEqual(['retencjaDni']);
    expect(bledy(BackupOffsiteDto, { ...admin, retencjaDni: nad })).toEqual(['retencjaDni']);
    expect(bledy(BackupOffsiteDto, { ...admin, retencjaDni: KOPIE_OFFSITE_DNI })).toEqual([]);
  });
});
