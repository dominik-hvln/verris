import { Prisma } from '@verris/database';
import { nadajNumerDokumentu, type KlientPrismy, type PozycjaFaktury } from './faktura-za-portfel.js';
import type { KursNbp } from './kurs-nbp.js';
import { etykietaStawki, rozbicieWgStawki, type TraktowanieVat, type VatDokumentu } from './vat.js';
import type { WynikVies } from './vies.service.js';

/** Dostawca dokumentów powstających przy doładowaniu portfela (M-34). */
export const DOSTAWCA_DOLADOWANIE = 'WALLET_TOPUP';

export interface DaneDokumentuDoladowania {
  userId: string;
  walletTxId: string;
  /** Kwota wpłaty w walucie wpłaty (brutto; przy „np” = netto). */
  kwota: Prisma.Decimal;
  waluta: string;
  /** Kurs NBP przy walucie obcej, null przy PLN. */
  kurs: KursNbp | null;
  traktowanie: TraktowanieVat;
  vies: WynikVies | null;
  /** Ile K trafiło na konto — do opisu pozycji. */
  kredytK: Prisma.Decimal;
  teraz: Date;
}

/**
 * M-34 — dokument za doładowanie, w TEJ SAMEJ transakcji co wpis księgi
 * (ta sama zasada co Z-01: dokument atomowy z ruchem pieniądza, PDF później).
 */
export async function utworzDokumentDoladowania(
  db: KlientPrismy,
  d: DaneDokumentuDoladowania,
): Promise<{ id: string; number: string }> {
  const t = d.traktowanie;
  const r = rozbicieWgStawki(d.kwota, t.stawka);
  const kurs = new Prisma.Decimal(d.kurs?.kurs ?? 1);
  const { numer, rodzajPrawny } = await nadajNumerDokumentu(db, d.teraz);
  const pozycje: PozycjaFaktury[] = [
    {
      name: `Doładowanie konta Verris — ${d.kredytK.toFixed(2)} K do wykorzystania na usługi hostingowe`,
      quantity: 1,
      unitNet: r.netto.toFixed(2),
      vatRate: t.stawka ?? 0,
      totalNet: r.netto.toFixed(2),
      totalVat: r.vat.toFixed(2),
      totalGross: r.brutto.toFixed(2),
      ...(t.stawka === null || !Number.isInteger(t.stawka) ? { vatLabel: etykietaStawki(t.stawka) } : {}),
    },
  ];
  const vat: VatDokumentu = {
    kod: t.kod,
    stawka: t.stawka,
    kraj: t.kraj,
    adnotacja: t.adnotacja,
    b2cUe: t.b2cUe,
    nettoPln: r.netto.mul(kurs).toDecimalPlaces(2).toFixed(2),
    vatPln: r.vat.mul(kurs).toDecimalPlaces(2).toFixed(2),
    kurs: d.kurs,
    vies: d.vies,
  };

  const faktura = await db.invoice.create({
    data: {
      userId: d.userId,
      number: numer,
      rodzajPrawny,
      status: 'PAID',
      amount: r.brutto,
      netAmount: r.netto,
      vatAmount: r.vat,
      vatRate: new Prisma.Decimal(t.stawka ?? 0),
      currency: d.waluta,
      provider: DOSTAWCA_DOLADOWANIE,
      providerRef: d.walletTxId,
      lineItems: pozycje as unknown as Prisma.InputJsonValue,
      buyerSnapshot: { vat } as unknown as Prisma.InputJsonValue,
      issuedAt: d.teraz,
      paidAt: d.teraz,
    },
    select: { id: true, number: true },
  });
  await db.walletTransaction.update({ where: { id: d.walletTxId }, data: { invoiceId: faktura.id } });
  return faktura;
}
