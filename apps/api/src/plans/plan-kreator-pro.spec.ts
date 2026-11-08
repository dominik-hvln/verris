import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Prisma } from '@verris/database';
import { CENA_KREATORA_PRO } from '@verris/kreator';
import { PLAN_KREATOR_PRO } from './plan-kreator-pro.js';
import { ZASOBY_APLIKACYJNE } from './plany-newsletter.js';
import { rozbicieVat } from '../billing/faktura-za-portfel.js';

/**
 * Paczka 121 — plan abonamentu Kreator Pro: definicja w kodzie, migracja SQL i cennik kreatora mówią to samo.
 */
const KORZEN = resolve(import.meta.dirname, '../../../..');
const MIGRACJE = resolve(KORZEN, 'libs/database/prisma/migrations');
const sql = () => readFileSync(resolve(MIGRACJE, '20261108140100_plan_kreator_pro/migration.sql'), 'utf-8');

/** Krotka VALUES (...) planu — od jego UUID do zamknięcia nawiasu; przecinki w literałach nie dzielą wartości. */
function krotka(id: string): string[] {
  const t = sql();
  const start = t.indexOf(`'${id}'`);
  expect(start).toBeGreaterThan(-1);
  return t
    .slice(start, t.indexOf('\n)', start))
    .replace(/'[^']*'/g, (m) => m.replace(/,/g, '\u0000'))
    .split(/,\s*/)
    .map((s) => s.replace(/\u0000/g, ',').trim());
}

describe('Paczka 121 – plan Verris Kreator Pro', () => {
  it('cennik zgodny z decyzją 8.11: 9,90 zł / 99 zł brutto, netto 8,05 / 80,49 (jak faktura)', () => {
    expect([PLAN_KREATOR_PRO.priceMonthly, PLAN_KREATOR_PRO.priceYearly]).toEqual(['9.90', '99.00']);
    expect(rozbicieVat(new Prisma.Decimal(PLAN_KREATOR_PRO.priceMonthly)).netto.toFixed(2)).toBe('8.05');
    expect(rozbicieVat(new Prisma.Decimal(PLAN_KREATOR_PRO.priceYearly)).netto.toFixed(2)).toBe('80.49');
  });

  it('zgodny z cennikiem kreatora (@verris/kreator CENA_KREATORA_PRO)', () => {
    expect(Number(PLAN_KREATOR_PRO.priceMonthly)).toBe(CENA_KREATORA_PRO.miesiacBrutto);
    expect(Number(PLAN_KREATOR_PRO.priceYearly)).toBe(CENA_KREATORA_PRO.rokBrutto);
    expect(Number(rozbicieVat(new Prisma.Decimal(PLAN_KREATOR_PRO.priceMonthly)).netto)).toBe(CENA_KREATORA_PRO.miesiacNetto);
    expect(Number(rozbicieVat(new Prisma.Decimal(PLAN_KREATOR_PRO.priceYearly)).netto)).toBe(CENA_KREATORA_PRO.rokNetto);
  });

  it('cena roczna przechodzi regułę API i niezmienników (rok ≥ 6× miesiąc)', () => {
    expect(Number(PLAN_KREATOR_PRO.priceYearly)).toBeGreaterThanOrEqual(Number(PLAN_KREATOR_PRO.priceMonthly) * 6);
  });

  it('migracja zapisuje plan dokładnie tak jak definicja: aplikacyjny, publiczny, bez próby', () => {
    const p = PLAN_KREATOR_PRO;
    const w = krotka(p.id);
    expect(w).toEqual(
      expect.arrayContaining([`'${p.slug}'`, `'${p.name}'`, `'${p.description}'`, p.priceMonthly, p.priceYearly, String(p.sortOrder), "'KREATOR_PRO'", 'NULL']),
    );
    const z = ZASOBY_APLIKACYJNE;
    expect(w.slice(4, 11).map(Number)).toEqual([z.cpuLimit, z.ramLimitMb, z.diskLimitMb, z.ioLimitKbps, z.iopsLimit, z.entryProcesses, z.nprocLimit]);
    // isPublic, isActive, sortOrder, trialDays
    expect(w.slice(15, 19)).toEqual(['true', 'true', String(p.sortOrder), '0']);
    expect(sql()).toMatch(/ON CONFLICT DO NOTHING;\s*$/);
  });

  it('wartość enuma dodana w osobnej, wcześniejszej migracji (PostgreSQL nie użyje jej w tej samej transakcji)', () => {
    const enumSql = readFileSync(resolve(MIGRACJE, '20261108140000_kreator_pro_enum/migration.sql'), 'utf-8');
    expect(enumSql).toContain(`ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'KREATOR_PRO'`);
    expect(enumSql).not.toContain('INSERT');
    expect('20261108140000_kreator_pro_enum' < '20261108140100_plan_kreator_pro').toBe(true);
  });
});
