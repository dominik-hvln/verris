import { Prisma, SubscriptionStatus } from '@verris/database';
import { AdminDashboardService } from '../../src/admin-dashboard/admin-dashboard.service.js';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * PB-34 — pulpit admina „Stan platformy” na prawdziwej bazie: sprawy „Wymaga uwagi”
 * pochodzą z faktycznego stanu (węzeł bez zielonego onboardu, zgłoszenie po SLA,
 * zatrzymana fala, wpłaty bez faktury), a CPU floty z próbek UsageMetric — nie z przydziału.
 */
const serwis = () => new AdminDashboardService(prisma() as never);
const MIN = 60_000;
/** Zakres pełny (ADMIN) — od nocy 15.10 overview() nie ma wartości domyślnych. */
const PELNY = { metryki: true, klienci: true, zgloszenia: true };

describe('PB-34 — pulpit admina', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('wymaga uwagi: onboard FAIL, cichy węzeł, SLA, fala, wpłaty bez faktury — krytyczne na górze', async () => {
    const zdrowy = await utworzWezel({ name: 'node-pl-01', totalCpuCores: 4 });
    const onboard = await utworzWezel({
      name: 'node-pl-02',
      onboardVerifiedAt: null,
      onboardReport: { ok: false, fail: 2, warn: 0, podsumowanie: 'FAIL: kopie off-site\nOK: WAF\nFAIL: IP w DirectAdmin' },
    });
    await utworzWezel({ name: 'node-pl-03', lastHeartbeatAt: new Date(Date.now() - 20 * MIN) });
    const klient = await prisma().user.create({
      data: { email: `pb34-${Date.now()}@test.verris.pl`, passwordHash: 'x', companyName: 'Piekarnia Zdrój' },
    });
    const t = await prisma().ticket.create({
      data: { userId: klient.id, subject: 'Strona nie działa po zmianie PHP', message: 'x', slaResponseDueAt: new Date(Date.now() - 12 * MIN) },
    });
    await prisma().ticket.create({
      data: { userId: klient.id, subject: 'Poczta', message: 'x', slaResponseDueAt: new Date(Date.now() + 30 * MIN) },
    });
    await prisma().auditLog.create({
      data: { action: 'FLEET_UPDATE_STOPPED', details: { fala: 'f1', serverId: zdrowy.id, nr: 2, razem: 3, pozostale: ['x'] } },
    });
    await prisma().invoice.create({
      data: { userId: klient.id, number: 'VDR/2026/09/9001', status: 'PAID', rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY', amount: new Prisma.Decimal('49.00'), issuedAt: new Date('2026-09-24T10:00:00Z') },
    });

    const o = await serwis().overview(PELNY);
    const tytuly = o.naUwadze.map((u) => u.tytul);
    expect(tytuly).toContain('node-pl-02 nie przeszedł weryfikacji onboardu');
    expect(o.naUwadze.find((u) => u.href === `/nodes/${onboard.id}`)?.opis).toBe('2 × FAIL: kopie off-site, IP w DirectAdmin · węzeł nie dostaje nowych kont');
    expect(tytuly).toContain('node-pl-03 nie wysyła sygnału');
    expect(o.naUwadze.find((u) => u.href === `/tickets/${t.id}`)?.opis).toMatch(/Piekarnia Zdrój · 1[23] min po terminie$/);
    expect(tytuly).toContain('Fala aktualizacji zatrzymana na węźle 2/3');
    expect(tytuly).toContain('1 wpłat czeka na fakturę z programu księgowego');
    const wagi = o.naUwadze.map((u) => u.waga);
    expect(wagi.lastIndexOf('crit')).toBeLessThan(wagi.indexOf('warn'));
    expect(o.zgloszenia).toEqual({ otwarte: 2, poTerminie: 1, dzis: expect.any(Number) });

    const menu = await serwis().menu();
    expect(menu).toMatchObject({ wezlyUwaga: 2, zgloszenia: 2, zgloszeniaPoTerminie: 1, flota: { razem: 3, dziala: 1 } });
  });

  it('flota: CPU realne z próbek (suma kont / rdzenie), węzeł poza pulą bez paska, konta policzone', async () => {
    const w = await utworzWezel({ name: 'node-de-01', totalCpuCores: 4 });
    await utworzWezel({ name: 'node-de-02', status: 'MAINTENANCE', maintenanceReason: 'wymiana dysku' });
    const k = await prisma().user.create({ data: { email: `pb34f-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const plan = await utworzPlan();
    const teraz = Date.now();
    for (const [i, cpu] of [[0, 100], [1, 60]] as const) {
      const s = await prisma().subscription.create({
        data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN' } as never,
      });
      const a = await prisma().account.create({ data: { daUsername: `pb34${i}`, domain: `pb34-${i}.pl`, userId: k.id, subscriptionId: s.id, serverId: w.id } as never });
      for (const m of [2, 4]) {
        await prisma().usageMetric.create({
          data: { subscriptionId: s.id, accountId: a.id, serverId: w.id, bucketStart: new Date(teraz - m * MIN), bucketDurationS: 60, cpuUsageAvg: cpu, memUsageAvgMb: 1, diskUsageMb: 1 },
        });
      }
    }

    const o = await serwis().overview(PELNY);
    const de1 = o.flota.wezly.find((x) => x.nazwa === 'node-de-01')!;
    // (100 + 60)% rdzenia na próbkę / 4 rdzenie = 40%
    expect(de1).toMatchObject({ cpuProc: 40, konta: 2, poza: null, stan: 'ok', sygnal: 'na żywo' });
    expect(o.flota.wezly.find((x) => x.nazwa === 'node-de-02')).toMatchObject({ poza: 'poza pulą — serwis', stan: 'warn', cpuProc: null });
    expect(o.naUwadze.map((u) => u.opis)).toContain('wymiana dysku · węzeł nie dostaje nowych kont');
    expect(o.uslugi).toMatchObject({ aktywne: 2, hosting: 2, poczta: 0 });
    expect(o.klienci!.razem).toBe(1);
    expect(o.klienci!.dzienne7.at(-1)).toBe(1);
  });

  /**
   * Weryfikacja 11.10 (decyzja właściciela) — L1 Konsultant ma pulpit (DASHBOARD_VIEW), ale nie metryki biznesowe:
   * „Stan platformy” bez przychodów, sum portfela i liczby klientów; flota, zgłoszenia i usługi zostają.
   */
  it('bez METRICS_VIEW: bez przychodów, portfela i liczby klientów; ADMIN i L4 widzą metryki', async () => {
    const k = await prisma().user.create({ data: { email: `m11-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    await prisma().invoice.create({
      data: { userId: k.id, number: 'FV/2026/10/9101', status: 'PAID', amount: new Prisma.Decimal('49.00'), issuedAt: new Date(), paidAt: new Date() } as never,
    });
    const bez = await serwis().overview({ ...PELNY, metryki: false });
    expect(bez).toMatchObject({ metryki: false, klienci: null, wplywy: null, billing: null, users: null });
    expect(JSON.stringify(bez)).not.toContain('49.00');
    expect(bez.zgloszenia).toEqual({ otwarte: 0, poTerminie: 0, dzis: 0 });
    const z = await serwis().overview(PELNY);
    expect(z.metryki).toBe(true);
    expect(z.klienci!.razem).toBe(1);
    expect(z.billing).not.toBeNull();

    const rola = async (nazwa: string, permissions: string[]) => {
      const r = await prisma().staffRole.create({ data: { name: `${nazwa}-${Date.now()}`, permissions, isSystem: false } });
      return prisma().user.create({ data: { email: `${nazwa}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: r.id } });
    };
    const l1 = await rola('l1', ['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'TICKETS_VIEW', 'TICKETS_MANAGE', 'BILLING_VIEW']);
    const l4 = await rola('l4', ['DASHBOARD_VIEW', 'METRICS_VIEW']);
    expect(await serwis().widziMetryki({ userId: l1.id, role: 'STAFF' })).toBe(false);
    expect(await serwis().widziMetryki({ userId: l4.id, role: 'STAFF' })).toBe(true);
    expect(await serwis().widziMetryki({ userId: 'x', role: 'ADMIN' })).toBe(true);
    expect(await serwis().widziMetryki({ userId: k.id, role: 'USER' })).toBe(false);
  });
});
