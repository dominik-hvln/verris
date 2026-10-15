import { Prisma, WalletTxType } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Decyzja 15.10 (#2) — gotówka poleconego, od której liczy się prowizja: wpłaty (TOPUP) minus to, co z nich cofnięto
 * po zwrocie albo sporze (`kwotaCofnieta`, także część niepobrana z portfela przy saldzie 0). Wcześniej cofnięcie przy
 * pustym portfelu nie zostawiało śladu w księdze, a prowizja od „kradzionej karty” szła po karencji przelewem.
 */
export async function gotowkaPoleconego(db: Db, userId: string): Promise<Prisma.Decimal> {
  const s = await db.walletTransaction.aggregate({
    where: { userId, type: WalletTxType.TOPUP, status: 'COMPLETED' },
    _sum: { amount: true, kwotaCofnieta: true },
  });
  const g = new Prisma.Decimal(s._sum.amount ?? 0).minus(new Prisma.Decimal(s._sum.kwotaCofnieta ?? 0));
  return g.greaterThan(0) ? g : new Prisma.Decimal(0);
}

/**
 * Po cofnięciu wpłaty: prowizje % od tego poleconego nie mogą mieć łącznie większej podstawy niż jego gotówka.
 * Nadwyżkę zdejmujemy od najnowszych prowizji jeszcze niewypłaconych (karencja albo dojrzałe bez wypłaty) —
 * mniejsza podstawa i kwota, a przy zerze CANCELED. Wypłaconych i zarezerwowanych do przelewu nie ruszamy:
 * `pozostalo` (podstawa) idzie do decyzji admina. Idempotentne: drugi przebieg nie ma już nadwyżki.
 */
export async function dopasujProwizjeDoGotowki(
  db: Db,
  referredUserId: string,
): Promise<{ zmniejszono: Prisma.Decimal; pozostalo: Prisma.Decimal }> {
  // Prowizja z poleceń i narzut resellera (O-07) liczą się od tej samej gotówki klienta, każda osobno.
  const wynik = { zmniejszono: new Prisma.Decimal(0), pozostalo: new Prisma.Decimal(0) };
  for (const rodzaj of ['RECURRING_PCT', 'RESELLER_MARKUP'] as const) {
    const w = await dopasujRodzaj(db, referredUserId, rodzaj); // po kolei — `db` bywa klientem transakcji
    wynik.zmniejszono = wynik.zmniejszono.plus(w.zmniejszono);
    wynik.pozostalo = wynik.pozostalo.plus(w.pozostalo);
  }
  return wynik;
}

async function dopasujRodzaj(
  db: Db,
  referredUserId: string,
  rodzaj: 'RECURRING_PCT' | 'RESELLER_MARKUP',
): Promise<{ zmniejszono: Prisma.Decimal; pozostalo: Prisma.Decimal }> {
  const zero = new Prisma.Decimal(0);
  const prowizje = await db.partnerCommission.findMany({
    where: { referredUserId, kind: rodzaj, status: { not: 'CANCELED' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, payoutId: true, baseAmount: true, amount: true },
  });
  const suma = prowizje.reduce((a, k) => a.plus(k.baseAmount ?? 0), zero);
  let nadwyzka = suma.minus(await gotowkaPoleconego(db, referredUserId));
  let zmniejszono = zero;
  for (const k of prowizje) {
    if (nadwyzka.lessThanOrEqualTo(0)) break;
    const wolna = k.status === 'PENDING' || (k.status === 'AVAILABLE' && k.payoutId == null);
    if (!wolna || !k.baseAmount || k.baseAmount.lessThanOrEqualTo(0)) continue;
    const zdejmij = Prisma.Decimal.min(nadwyzka, k.baseAmount);
    const nowaBaza = new Prisma.Decimal(k.baseAmount).minus(zdejmij);
    const nowaKwota = nowaBaza.lessThanOrEqualTo(0)
      ? zero
      : new Prisma.Decimal(k.amount).mul(nowaBaza).div(k.baseAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const { count } = await db.partnerCommission.updateMany({
      where: { id: k.id, status: k.status, payoutId: null },
      data: nowaBaza.lessThanOrEqualTo(0) ? { status: 'CANCELED' } : { baseAmount: nowaBaza, amount: nowaKwota },
    });
    if (!count) continue;
    nadwyzka = nadwyzka.minus(zdejmij);
    zmniejszono = zmniejszono.plus(new Prisma.Decimal(k.amount).minus(nowaKwota));
  }
  return { zmniejszono, pozostalo: nadwyzka.greaterThan(0) ? nadwyzka : zero };
}
