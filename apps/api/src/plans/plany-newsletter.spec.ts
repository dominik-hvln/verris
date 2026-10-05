import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PLANY_NEWSLETTER, ZASOBY_APLIKACYJNE } from './plany-newsletter.js';

/**
 * Q-05 — pakiety e-mail marketingu: definicja w kodzie, migracja SQL i treść strony mówią to samo.
 * Do 2026-10-05 usługi nie dało się kupić — w bazie nie było żadnego planu EMAIL_MARKETING.
 */
const KORZEN = resolve(import.meta.dirname, '../../../..');
const sql = () =>
  readFileSync(resolve(KORZEN, 'libs/database/prisma/migrations/20261005140000_plany_newsletter/migration.sql'), 'utf-8');

/** Krotka VALUES (...) planu o danym id — od jego UUID do zamknięcia nawiasu. */
function krotka(id: string): string[] {
  const t = sql();
  const start = t.indexOf(`'${id}'`);
  expect(start).toBeGreaterThan(-1);
  // Przecinki wewnątrz literałów (opis) nie dzielą wartości.
  return t
    .slice(start, t.indexOf('\n)', start))
    .replace(/'[^']*'/g, (m) => m.replace(/,/g, '\u0000'))
    .split(/,\s*/)
    .map((s) => s.replace(/\u0000/g, ',').trim());
}

describe('Q-05 — pakiety Newsletter', () => {
  it('cennik zgodny z decyzją: 19/190 zł i 49/490 zł brutto, limity kontaktów i wysyłek', () => {
    expect(PLANY_NEWSLETTER.map((p) => [p.slug, p.priceMonthly, p.priceYearly, p.emmMaxContacts, p.emmMonthlySends])).toEqual([
      ['newsletter-start', '19.00', '190.00', 1000, 5000],
      ['newsletter-plus', '49.00', '490.00', 5000, 25000],
    ]);
  });

  it('ceny przechodzą regułę API i niezmienników (rok ≥ 6× miesiąc), zasoby dodatnie, NPROC > EP + 15', () => {
    for (const p of PLANY_NEWSLETTER) expect(Number(p.priceYearly)).toBeGreaterThanOrEqual(Number(p.priceMonthly) * 6);
    expect(ZASOBY_APLIKACYJNE.nprocLimit).toBeGreaterThan(ZASOBY_APLIKACYJNE.entryProcesses + 15);
    expect(Math.min(ZASOBY_APLIKACYJNE.cpuLimit, ZASOBY_APLIKACYJNE.ramLimitMb, ZASOBY_APLIKACYJNE.diskLimitMb)).toBeGreaterThan(0);
  });

  it.each(PLANY_NEWSLETTER.map((p) => [p.slug, p] as const))('migracja zapisuje %s dokładnie tak jak definicja', (_slug, p) => {
    const w = krotka(p.id);
    expect(w).toEqual(
      expect.arrayContaining([
        `'${p.slug}'`,
        `'${p.name}'`,
        `'${p.description}'`,
        p.priceMonthly,
        p.priceYearly,
        String(p.emmMaxContacts),
        String(p.emmMonthlySends),
        String(p.sortOrder),
        "'EMAIL_MARKETING'",
        'NULL',
      ]),
    );
    // Zasoby neutralne w kolejności kolumn: cpu, ram, dysk, io, iops, EP, NPROC.
    const z = ZASOBY_APLIKACYJNE;
    expect(w.slice(4, 11).map(Number)).toEqual([z.cpuLimit, z.ramLimitMb, z.diskLimitMb, z.ioLimitKbps, z.iopsLimit, z.entryProcesses, z.nprocLimit]);
    // Publiczny i aktywny (isPublic, isActive).
    expect(w.slice(15, 17)).toEqual(['true', 'true']);
  });

  it('migracja nie wywraca wdrożenia przy konflikcie id ani slug', () => {
    expect(sql()).toMatch(/ON CONFLICT DO NOTHING;\s*$/);
  });

  it('strona pokazuje te same ceny i limity (apps/www/src/lib/oferta.ts)', () => {
    const oferta = readFileSync(resolve(KORZEN, 'apps/www/src/lib/oferta.ts'), 'utf-8');
    for (const p of PLANY_NEWSLETTER) {
      expect(oferta).toContain(`nazwa: '${p.name}'`);
      expect(oferta).toContain(`miesiecznie: ${Number(p.priceMonthly)}, rocznie: ${Number(p.priceYearly)}`);
      expect(oferta).toContain(`kontakty: ${p.emmMaxContacts}, wysylki: ${p.emmMonthlySends}`);
    }
  });
});
