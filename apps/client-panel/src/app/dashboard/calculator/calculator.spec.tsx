/**
 * Uwaga Dominika 6.11.2026: kwoty za godzinę z autoskalowania mają ułamki grosza — kalkulator w panelu nie może ich
 * skracać do 4 miejsc (50% CPU × 0,001323 = 0,06615, a nie „0,0662”). Liczy na pełnych stawkach z API.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoscalingCalculator } from './calculator';
import type { PriceRuleDto } from './types';

const reguly: PriceRuleDto[] = [
  { id: 'c', resource: 'CPU', unit: 'cpu_pct', pricePerUnit: '0.001323', currency: 'PLN', thresholdAbove: 0, isActive: true },
  { id: 'r', resource: 'RAM', unit: 'ram_gb', pricePerUnit: '0.0882', currency: 'PLN', thresholdAbove: 0, isActive: true },
  { id: 'd', resource: 'DISK', unit: 'disk_gb', pricePerUnit: '0.0008', currency: 'PLN', thresholdAbove: 0, isActive: true },
];

it('stawki godzinowe wszystkimi cyframi: 50% CPU = 0,06615, 0,5 GB RAM = 0,0441, razem 0,11025', () => {
  const html = renderToStaticMarkup(<AutoscalingCalculator rules={reguly} initialCpuPercent={50} initialRamGb={0.5} />);
  expect(html).toContain('0,06615 K/h');
  expect(html).toContain('0,0441 K/h');
  expect(html).toContain('0,11025 K');
  expect(html).not.toContain('0,0662');
});
