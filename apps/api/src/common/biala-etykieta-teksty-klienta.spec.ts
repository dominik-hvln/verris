import { describe, expect, it } from 'vitest';
import { zdradzaPanelSerwera } from '@verris/contracts';
import { EcoReportService } from '../eco/eco-report.service.js';
import { planChangedTemplate } from '../mail/templates/plan-change-notifications.js';

/**
 * White label — teksty, które klient dostaje wprost (raport EKO w panelu, e-mail o zmianie planu),
 * nie mogą nazywać oprogramowania węzła. Na żywo 09.10: stopka raportu EKO pokazywała
 * „metryk CloudLinux LVE”, a e-mail o zmianie planu „Limity LVE”.
 */
describe('white label: teksty dla klienta bez nazw oprogramowania węzła', () => {
  it('metodologia raportu EKO', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({
          id: 's1',
          ecoModeEnabled: false,
          account: { id: 'a1' },
          plan: { cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200 },
        }),
      },
      usageMetric: {
        findMany: async () => [{ cpuUsageAvg: 10, memUsageAvgMb: 100, bucketDurationS: 60 }],
      },
    };
    const raport = await new EcoReportService(prisma as never).reportForSubscription('s1', 'u1');
    expect(raport.methodology).toContain('próbki co 60 s');
    expect(zdradzaPanelSerwera(raport.methodology)).toBe(false);
  });

  it('e-mail o zmianie planu', () => {
    const mail = planChangedTemplate({
      to: 'k@example.com',
      firstName: 'Ala',
      domain: 'example.com',
      fromPlanName: 'Start',
      toPlanName: 'Pro',
      direction: 'upgrade',
      amountDue: '10.00',
      amountCredit: '0',
      currency: 'PLN',
      panelUrl: 'https://panel.example.com',
      serviceUrl: 'https://panel.example.com/s/1',
    });
    for (const tekst of [mail.subject, mail.html, mail.text ?? '']) {
      expect(zdradzaPanelSerwera(String(tekst))).toBe(false);
    }
    expect(String(mail.text ?? mail.html)).toContain('Limity zasobów (CPU, RAM, dysk)');
  });
});
