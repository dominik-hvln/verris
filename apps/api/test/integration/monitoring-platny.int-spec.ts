import { WalletTxType } from '@verris/database';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SiteMonitorService } from '../../src/subscriptions/site-monitor.service.js';
import { atrapy, prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 / MON-3 — miesięczne rozliczanie płatnego monitoringu na prawdziwej bazie. Rozliczanie nie patrzyło
 * na stan usługi: po anulowaniu hostingu co miesiąc pobierało opłatę za monitoring strony, której już nie
 * ma, a po wznowieniu wstrzymanej usługi nadrabiało zaległe miesiące co godzinę.
 */
const DZIEN = 86_400_000;
const ustawienia = { getMonitoringSettings: async () => ({ paidMonthlyPrice: 9, paidOffered: true, paidIntervalMinutes: 1, freeIntervalMinutes: 5 }) };

function serwis() {
  const p = prisma() as never;
  return new SiteMonitorService(p, atrapy.audit() as never, atrapy.mailer() as never, atrapy.config() as never, new WalletLedgerService(p), ustawienia as never, null as never);
}

async function monitorPlatny(status: 'ACTIVE' | 'CANCELED' | 'SUSPENDED', termin: Date) {
  const w = await utworzWezel();
  const plan = await utworzPlan();
  const { user, subscription } = await utworzKonto({ serverId: w.id, planId: plan.id });
  await prisma().user.update({ where: { id: user.id }, data: { walletBalance: 100 } });
  await prisma().subscription.update({ where: { id: subscription.id }, data: { status } });
  const m = await prisma().siteMonitor.create({
    data: { subscriptionId: subscription.id, url: 'https://konto.test', paidTier: true, paidActivatedAt: new Date(termin.getTime() - 30 * DZIEN), paidNextChargeAt: termin },
  });
  return { user, subscription, m };
}
const obciazenia = (userId: string) => prisma().walletTransaction.count({ where: { userId, type: WalletTxType.CHARGE_USAGE } });

describe('X-04 płatny monitoring — rozliczanie', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('usługa anulowana: bez opłaty, monitoring wraca do darmowego', async () => {
    const { user, m } = await monitorPlatny('CANCELED', new Date(Date.now() - DZIEN));
    await serwis().billPaidMonitors();
    expect(await obciazenia(user.id)).toBe(0);
    expect((await prisma().siteMonitor.findUniqueOrThrow({ where: { id: m.id } })).paidTier).toBe(false);
  });

  it('usługa wstrzymana: bez opłaty i bez zmiany terminu; po wznowieniu jedna opłata, następna za miesiąc od dziś', async () => {
    const termin = new Date(Date.now() - 70 * DZIEN); // przerwa dłuższa niż dwa okresy
    const { user, subscription, m } = await monitorPlatny('SUSPENDED', termin);
    await serwis().billPaidMonitors();
    expect(await obciazenia(user.id)).toBe(0);
    expect((await prisma().siteMonitor.findUniqueOrThrow({ where: { id: m.id } })).paidNextChargeAt).toEqual(termin);

    await prisma().subscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE' } });
    await serwis().billPaidMonitors();
    await serwis().billPaidMonitors(); // kolejna godzina — bez nadrabiania zaległych miesięcy
    expect(await obciazenia(user.id)).toBe(1);
    const nastepny = (await prisma().siteMonitor.findUniqueOrThrow({ where: { id: m.id } })).paidNextChargeAt!;
    expect(nastepny.getTime()).toBeGreaterThan(Date.now() + 27 * DZIEN);
  });

  it('usługa aktywna: opłata raz za okres, termin przesunięty o miesiąc', async () => {
    const termin = new Date(Date.now() - 60_000);
    const { user, m } = await monitorPlatny('ACTIVE', termin);
    await serwis().billPaidMonitors();
    await serwis().billPaidMonitors();
    expect(await obciazenia(user.id)).toBe(1);
    expect(Number((await prisma().user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance)).toBe(91);
    expect((await prisma().siteMonitor.findUniqueOrThrow({ where: { id: m.id } })).paidNextChargeAt!.getTime()).toBeGreaterThan(Date.now() + 27 * DZIEN);
  });

  it('włączenie płatnego monitoringu dla usługi wstrzymanej — odmowa bez opłaty', async () => {
    const { user, subscription, m } = await monitorPlatny('SUSPENDED', new Date(Date.now() + DZIEN));
    await prisma().siteMonitor.update({ where: { id: m.id }, data: { paidTier: false, paidNextChargeAt: null } });
    await expect(serwis().setPaidMonitoring(subscription.id, user.id, true)).rejects.toThrow('działającej usługi');
    expect(await obciazenia(user.id)).toBe(0);
  });
});
