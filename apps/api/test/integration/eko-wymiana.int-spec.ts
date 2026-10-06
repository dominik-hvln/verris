import { WalletTxType } from '@verris/database';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Wymiana punktów EKO na środki w portfelu (PATCH /users/me/eco-redeem) na prawdziwej bazie.
 *
 * Do 2026-10 wymiana czytała punkty i saldo, a potem zapisywała oba pola wartością absolutną,
 * z pominięciem księgi portfela. Pod READ COMMITTED dwa równoległe żądania czytały te same 100 pkt
 * i oba zasilały portfel, a równoległy wpis księgi mógł zostać nadpisany (lost update).
 */

function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  return {
    ledger,
    users: new UsersService(p, {} as never, {} as never, {} as never, {} as never, ledger),
  };
}

let n = 0;
const klient = (extra: Record<string, unknown> = {}) => {
  n += 1;
  return prisma().user.create({
    data: { email: `eko-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', ...extra },
  });
};

describe('wymiana punktów EKO na środki w portfelu', () => {
  beforeAll(async () => {
    // Rozgrzanie puli połączeń: na zimnej puli połączenia otwierają się po kolei, transakcje
    // biegną praktycznie szeregowo i wyścig na starym kodzie wychodził tylko czasem.
    await Promise.all(Array.from({ length: 5 }, () => prisma().$queryRaw`SELECT pg_sleep(0.05)::text`));
  });

  beforeEach(async () => {
    await wyczyscBaze();
  });

  afterAll(async () => {
    await rozlacz();
  });

  it('równoległe żądania zaliczają te same punkty tylko raz', async () => {
    const { users } = uslugi();
    const u = await klient({ ecoPoints: 100 });

    const wyniki = await Promise.allSettled(
      Array.from({ length: 5 }, () => users.redeemEcoPoints(u.id, { points: 100 })),
    );

    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.ecoPoints).toBe(0);
    expect(po.walletBalance.toFixed(2)).toBe('10.00');
    expect(await prisma().walletTransaction.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma().ecoPointsLedgerEntry.count({ where: { userId: u.id } })).toBe(1);
  });

  it('nie nadpisuje równoległego wpisu księgi — saldo równa się sumie wpisów', async () => {
    const { users, ledger } = uslugi();
    const u = await klient({ ecoPoints: 500 });

    await Promise.all([
      ...Array.from({ length: 5 }, () => users.redeemEcoPoints(u.id, { points: 100 })),
      ...Array.from({ length: 5 }, (_, i) =>
        ledger.credit({ userId: u.id, type: WalletTxType.TOPUP, amount: 50, idempotencyKey: `eko-top-${u.id}-${i}` }),
      ),
    ]);

    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.ecoPoints).toBe(0);
    expect(po.walletBalance.toFixed(2)).toBe('300.00');
  });

  it('zwraca saldo i punkty po wymianie, a wpis ma typ i opis jak dotąd', async () => {
    const { users } = uslugi();
    const u = await klient({ ecoPoints: 250, walletBalance: 5 });

    const r = await users.redeemEcoPoints(u.id, { points: 200 });

    expect(r).toEqual({
      ok: true,
      pointsSpent: 200,
      creditedAmount: '20.00',
      pointsAfter: 50,
      walletBalanceAfter: '25.00',
    });
    const tx = await prisma().walletTransaction.findFirstOrThrow({ where: { userId: u.id } });
    expect(tx.type).toBe(WalletTxType.PROMO_CREDIT);
    expect(tx.paymentProvider).toBe('EKO');
    expect(tx.balanceAfter.toFixed(2)).toBe('25.00');
  });

  it('subkonto nie wymienia punktów — portfel należy do właściciela, punkty zostają', async () => {
    const { users } = uslugi();
    const wlasciciel = await klient();
    const sub = await klient({ ecoPoints: 100, customerOwnerId: wlasciciel.id });

    await expect(users.redeemEcoPoints(sub.id, { points: 100 })).rejects.toThrow(/subkonto/);

    const po = await prisma().user.findUniqueOrThrow({ where: { id: sub.id } });
    expect(po.ecoPoints).toBe(100);
    expect(po.walletBalance.toFixed(2)).toBe('0.00');
    expect(await prisma().ecoPointsLedgerEntry.count({ where: { userId: sub.id } })).toBe(0);
  });

  it('za mało punktów — odmowa bez zmian', async () => {
    const { users } = uslugi();
    const u = await klient({ ecoPoints: 50 });
    await expect(users.redeemEcoPoints(u.id, { points: 100 })).rejects.toThrow(/Za mało punktów/);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).ecoPoints).toBe(50);
  });
});
