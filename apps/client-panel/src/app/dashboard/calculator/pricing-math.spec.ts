import { hourlyRateForResource } from './pricing-math';
import type { PriceRuleDto } from './types';

/**
 * X-05 — kalkulator kosztu autoskalowania.
 *
 * CO PILNUJE. Kalkulator pokazuje klientowi, ile zapłaci za godzinę/miesiąc
 * zasobów ponad plan. Musi liczyć DOKŁADNIE tak jak API
 * (`apps/api/src/autoscaling/autoscaling-pricing.util.ts` →
 * `hourlyCostBreakdownForCatalogAmounts`), bo inaczej obiecujemy inną kwotę,
 * niż potem zdejmiemy z portfela. Przypadki niżej są te same, które decydują
 * o wyniku po stronie API: wybór progu, reguły nieaktywne, stare reguły w MB
 * i ilość poniżej najniższego progu.
 */

let seq = 0;
const rule = (p: Partial<PriceRuleDto> & Pick<PriceRuleDto, 'resource'>): PriceRuleDto => ({
  id: `r${++seq}`,
  unit: p.resource === 'CPU' ? 'cpu_percent' : 'ram_gb',
  pricePerUnit: '0.01',
  currency: 'PLN',
  thresholdAbove: 0,
  isActive: true,
  ...p,
});

describe('X-05 hourlyRateForResource', () => {
  it('zero, ujemna ilość albo brak reguł → 0 (nic nie naliczamy)', () => {
    const rules = [rule({ resource: 'RAM' })];
    expect(hourlyRateForResource(rules, 'RAM', 0)).toBe(0);
    expect(hourlyRateForResource(rules, 'RAM', -2)).toBe(0);
    expect(hourlyRateForResource(rules, 'CPU', 50)).toBe(0);
  });

  it('wybiera najwyższy próg, który ilość osiąga, i mnoży całą ilość przez jego cenę', () => {
    const rules = [
      rule({ resource: 'RAM', unit: 'ram_gb', thresholdAbove: 0, pricePerUnit: '0.05' }),
      rule({ resource: 'RAM', unit: 'ram_gb', thresholdAbove: 4, pricePerUnit: '0.04' }),
      rule({ resource: 'RAM', unit: 'ram_gb', thresholdAbove: 8, pricePerUnit: '0.03' }),
    ];
    expect(hourlyRateForResource(rules, 'RAM', 2)).toBeCloseTo(0.1, 10);
    expect(hourlyRateForResource(rules, 'RAM', 4)).toBeCloseTo(0.16, 10);
    expect(hourlyRateForResource(rules, 'RAM', 10)).toBeCloseTo(0.3, 10);
  });

  it('pomija reguły nieaktywne i reguły innego zasobu', () => {
    const rules = [
      rule({ resource: 'DISK', unit: 'disk_gb', thresholdAbove: 0, pricePerUnit: '0.002' }),
      rule({ resource: 'DISK', unit: 'disk_gb', thresholdAbove: 10, pricePerUnit: '9', isActive: false }),
      rule({ resource: 'RAM', unit: 'ram_gb', thresholdAbove: 0, pricePerUnit: '5' }),
    ];
    expect(hourlyRateForResource(rules, 'DISK', 20)).toBeCloseTo(0.04, 10);
  });

  it('ilość poniżej najniższego progu → najniższa reguła (jak w API)', () => {
    const rules = [rule({ resource: 'CPU', thresholdAbove: 100, pricePerUnit: '0.001' })];
    expect(hourlyRateForResource(rules, 'CPU', 50)).toBeCloseTo(0.05, 10);
  });

  it('stara reguła w MB: próg w MB porównany z GB, ilość przeliczona na MB', () => {
    const rules = [
      rule({ resource: 'RAM', unit: 'ram_mb', thresholdAbove: 0, pricePerUnit: '0.00005' }),
      rule({ resource: 'RAM', unit: 'ram_mb', thresholdAbove: 4096, pricePerUnit: '0.00002' }),
    ];
    // 2 GB < 4096 MB → pierwsza reguła: 2048 MB × 0,00005
    expect(hourlyRateForResource(rules, 'RAM', 2)).toBeCloseTo(0.1024, 10);
    // 4 GB = 4096 MB → druga reguła: 4096 MB × 0,00002
    expect(hourlyRateForResource(rules, 'RAM', 4)).toBeCloseTo(0.08192, 10);
  });

  it('CPU zawsze w procentach, niezależnie od jednostki reguły', () => {
    const rules = [rule({ resource: 'CPU', unit: 'cpu_mb', thresholdAbove: 0, pricePerUnit: '0.002' })];
    expect(hourlyRateForResource(rules, 'CPU', 150)).toBeCloseTo(0.3, 10);
  });
});
