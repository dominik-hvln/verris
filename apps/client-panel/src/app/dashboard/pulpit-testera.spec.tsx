import { renderToString } from 'react-dom/server';
import { DashboardHome } from './dashboard-home';
import type { DashboardSnapshot } from './dashboard-data';

jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: jest.fn(async () => ({})) }));

/**
 * P1-11 — pulpit nowej testerki: nic nie mówiło, co zrobić z kodem z zaproszenia, a kafelek „Asystent”
 * obiecywał „Pilnujemy DNS, SSL, kopii i obciążenia” przy zerze usług. Na starym kodzie oba asercje padają.
 */
const pusty = {
  profile: null,
  services: [],
  domains: [],
  ecoProgram: null,
  wallet: null,
  ecoLedger: [],
  tickets: [],
  openTickets: 0,
  errors: {},
  bezDostepu: {},
} as unknown as DashboardSnapshot;

describe('pulpit nowego testera (P1-11)', () => {
  it('z zaproszeniem: kafelek „Masz kod z zaproszenia” prowadzi do karty „Kod promocyjny” w Płatnościach', () => {
    const html = renderToString(<DashboardHome snapshot={pusty} zaproszenieBety />);
    expect(html).toContain('Masz kod z zaproszenia do testów?');
    expect(html).toContain('href="/dashboard/billing#kod-promocyjny"');
  });

  it('bez zaproszenia kafelka nie ma', () => {
    expect(renderToString(<DashboardHome snapshot={pusty} />)).not.toContain('Masz kod z zaproszenia');
  });

  it('asystent bez usług nie obiecuje pilnowania DNS, SSL i kopii', () => {
    const html = renderToString(<DashboardHome snapshot={pusty} />);
    expect(html).not.toContain('Wszystko pod kontrolą');
    expect(html).toContain('Gdy zamówisz pierwszą usługę');
  });
});
