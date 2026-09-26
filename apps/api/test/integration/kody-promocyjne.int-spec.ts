import { PromoKind, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — kody promocyjne na prawdziwej bazie. To ścieżka, która dopisuje pieniądze do portfela
 * bez wpłaty, więc sedno: każdy kod daje kredyt dokładnie raz na klienta, limit użyć trzyma się
 * także przy równoczesnych próbach, a ponowny webhook doładowania nie dubluje bonusu.
 */

function promo() {
  const p = prisma() as never;
  return new PromoService(p, new WalletLedgerService(p), new AuditService(p), { send: async () => ({}) } as never, { get: () => undefined } as never);
}

let n = 0;
const klient = () => {
  n += 1;
  return prisma().user.create({ data: { email: `promo-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0 } });
};
const kod = (code: string, o: Record<string, unknown> = {}) =>
  prisma().promoCode.create({ data: { code, kind: PromoKind.FIXED_CREDIT, value: 50, currency: 'PLN', active: true, ...o } as never });
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const kredyty = (userId: string) => prisma().walletTransaction.count({ where: { userId, type: WalletTxType.PROMO_CREDIT } });

describe('X-04 kody promocyjne', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('voucher: kredyt raz, wpis w księdze i licznik użyć; drugi raz odmowa bez zmiany salda', async () => {
    const k = await klient();
    const c = await kod('START50');
    const wynik = await promo().redeemPromo(k.id, ' start50 ');
    expect(wynik.amountPln).toBe('50.00');
    expect(await saldo(k.id)).toBe(50);
    expect(await kredyty(k.id)).toBe(1);
    await expect(promo().redeemPromo(k.id, 'START50')).rejects.toThrow('Już zrealizowałeś');
    expect(await saldo(k.id)).toBe(50);
    expect((await prisma().promoCode.findUniqueOrThrow({ where: { id: c.id } })).redemptionCount).toBe(1);
  });

  it('podwójne kliknięcie (dwa równoczesne żądania) — portfel zasilony raz', async () => {
    const k = await klient();
    await kod('DWAKLIK');
    const s = promo();
    await Promise.allSettled([s.redeemPromo(k.id, 'DWAKLIK'), s.redeemPromo(k.id, 'DWAKLIK')]);
    expect(await saldo(k.id)).toBe(50);
    expect(await kredyty(k.id)).toBe(1);
  });

  it('limit użyć trzyma się przy równoczesnych próbach różnych klientów', async () => {
    await kod('JEDEN', { maxRedemptions: 1 });
    const k = await Promise.all([klient(), klient(), klient(), klient()]);
    const s = promo();
    const wyniki = await Promise.allSettled(k.map((x) => s.redeemPromo(x.id, 'JEDEN')));
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const salda = await Promise.all(k.map((x) => saldo(x.id)));
    expect(salda.reduce((a, b) => a + b, 0)).toBe(50);
    expect(await prisma().promoRedemption.count()).toBe(1);
  });

  it('kod wygasły, nieaktywny i procentowy nie dają kredytu', async () => {
    const k = await klient();
    await kod('STARY', { validTo: new Date(Date.now() - 86400000) });
    await kod('WYLACZONY', { active: false });
    await kod('PROCENT', { kind: PromoKind.PERCENT_BONUS, value: 10 });
    await expect(promo().redeemPromo(k.id, 'STARY')).rejects.toThrow('wygasł');
    await expect(promo().redeemPromo(k.id, 'WYLACZONY')).rejects.toThrow('nieaktywny');
    await expect(promo().redeemPromo(k.id, 'PROCENT')).rejects.toThrow('doładowaniu');
    expect(await saldo(k.id)).toBe(0);
  });

  it('bonus procentowy do doładowania: ponowny webhook nie dubluje bonusu', async () => {
    const k = await klient();
    const c = await kod('PLUS10', { kind: PromoKind.PERCENT_BONUS, value: 10 });
    const s = promo();
    const podglad = await s.previewPercentBonus(k.id, 'plus10', new (await import('@verris/database')).Prisma.Decimal(200));
    expect(podglad.bonusAmount.toFixed(2)).toBe('20.00');
    const wej = { userId: k.id, promoCodeId: c.id, bonusAmount: podglad.bonusAmount, relatedWalletTxId: 'tx-topup', sessionId: 'cs_1' };
    const a = await s.applyPercentBonusForTopup(wej);
    const b = await s.applyPercentBonusForTopup(wej);
    expect(b.walletTxId).toBe(a.walletTxId);
    expect(await saldo(k.id)).toBe(20);
    expect(await kredyty(k.id)).toBe(1);
  });
});
