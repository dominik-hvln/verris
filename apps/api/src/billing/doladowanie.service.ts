import { Injectable } from '@nestjs/common';
import { Prisma, WalletTransaction, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from './wallet-ledger.service';
import type { WynikVies } from './vies.service';
import { VatNabywcyService } from './vat-nabywcy.service';
import { kursSredniPrzed } from './kurs-nbp';
import { odczytajModelFakturowania } from './tryb-fakturowania';
import { utworzDokumentDoladowania } from './doladowanie';
import { kredytZaWplate, traktowanieZKodu, type TraktowanieVat } from './vat';

export type WalutaWplaty = 'PLN' | 'EUR' | 'USD';
export const WALUTY_WPLATY: readonly WalutaWplaty[] = ['PLN', 'EUR', 'USD'];

/**
 * M-09/M-10/M-34 — doładowanie portfela: stawka VAT nabywcy, waluta wpłaty,
 * ile K dostaje klient i dokument przy wpłacie. Jedyne miejsce, które zamienia
 * realną wpłatę na K — Checkout i auto-doładowanie idą tędy, żeby reguła nie
 * miała dwóch kopii.
 */
@Injectable()
export class DoladowanieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly vatNabywcy: VatNabywcyService,
  ) {}

  ustalTraktowanie(userId: string): Promise<{ traktowanie: TraktowanieVat; vies: WynikVies | null }> {
    return this.vatNabywcy.ustal(userId);
  }

  /** Metadane płatności Stripe — ustalone przy jej tworzeniu, obowiązują przy księgowaniu. */
  static doMetadanych(t: TraktowanieVat, vies: WynikVies | null): Record<string, string> {
    return {
      vatKod: t.kod,
      vatStawka: t.stawka === null ? 'np' : String(t.stawka),
      vatKraj: t.kraj,
      ...(vies ? { vies: JSON.stringify(vies).slice(0, 490) } : {}),
    };
  }

  static zMetadanych(m: Record<string, string | undefined> | null | undefined): { traktowanie: TraktowanieVat; vies: WynikVies | null } | null {
    if (!m?.vatKod || !m.vatKraj) return null;
    const stawka = m.vatStawka === 'np' || !m.vatStawka ? null : Number(m.vatStawka);
    const traktowanie = traktowanieZKodu(m.vatKod, stawka, m.vatKraj);
    if (!traktowanie) return null;
    let vies: WynikVies | null;
    try { vies = m.vies ? (JSON.parse(m.vies) as WynikVies) : null; } catch { vies = null; }
    return { traktowanie, vies };
  }

  /**
   * Zaksięgowanie realnej wpłaty: K na konto + (w modelu `przy_doladowaniu`)
   * dokument — atomowo. Idempotentne po `idempotencyKey`.
   */
  async zaksieguj(i: {
    userId: string;
    kwotaMinor: number;
    waluta: string;
    meta?: Record<string, string | undefined> | null;
    idempotencyKey: string;
    paymentRef: string;
    opis: string;
    zaplaconoAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<{ wpis: WalletTransaction; kredytK: Prisma.Decimal; nowy: boolean }> {
    const istniejacy = await this.ledger.findByIdempotencyKey(i.idempotencyKey);
    if (istniejacy) return { wpis: istniejacy, kredytK: new Prisma.Decimal(istniejacy.amount), nowy: false };

    const waluta = i.waluta.toUpperCase() as WalutaWplaty;
    if (!WALUTY_WPLATY.includes(waluta)) throw new Error(`Nieobsługiwana waluta wpłaty: ${i.waluta}`);
    const kwota = new Prisma.Decimal(i.kwotaMinor).dividedBy(100);
    const { traktowanie, vies } = DoladowanieService.zMetadanych(i.meta) ?? (await this.ustalTraktowanie(i.userId));
    const kurs = waluta === 'PLN' ? null : await kursSredniPrzed(waluta, i.zaplaconoAt);
    const kwotaPln = kwota.mul(kurs?.kurs ?? 1).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const kredytK = kredytZaWplate(kwotaPln, traktowanie);
    const teraz = new Date();

    try {
      const wpis = await this.prisma.$transaction(async (tx) => {
        const w = await this.ledger.zapiszWpis(
          tx,
          {
            userId: i.userId,
            amount: kredytK,
            type: WalletTxType.TOPUP,
            description: i.opis,
            idempotencyKey: i.idempotencyKey,
            paymentProvider: 'STRIPE',
            paymentRef: i.paymentRef,
            metadata: {
              ...(i.metadata ?? {}),
              wplata: { kwota: kwota.toFixed(2), waluta, kurs: kurs?.kurs ?? null, vat: traktowanie.kod },
            } as Prisma.InputJsonValue,
          },
          'credit',
          kredytK,
          kredytK,
        );
        if ((await odczytajModelFakturowania(tx)) === 'przy_doladowaniu') {
          await utworzDokumentDoladowania(tx, {
            userId: i.userId, walletTxId: w.id, kwota, waluta, kurs, traktowanie, vies, kredytK, teraz,
          });
        }
        return w;
      });
      return { wpis, kredytK, nowy: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const w = await this.ledger.findByIdempotencyKey(i.idempotencyKey);
        if (w) return { wpis: w, kredytK: new Prisma.Decimal(w.amount), nowy: false };
      }
      throw err;
    }
  }

  /** Podgląd dla formularza doładowania: stawka i ile K wyjdzie (przy walucie — szacunek z bieżącego kursu). */
  async podglad(userId: string, kwota: number, waluta: WalutaWplaty) {
    const { traktowanie, vies } = await this.ustalTraktowanie(userId);
    let kurs: number | null = null;
    if (waluta !== 'PLN') {
      try { kurs = (await kursSredniPrzed(waluta, new Date())).kurs; } catch { kurs = null; }
    }
    const kwotaPln = new Prisma.Decimal(kwota).mul(kurs ?? 1);
    return {
      vatKod: traktowanie.kod,
      stawka: traktowanie.stawka,
      adnotacja: traktowanie.adnotacja,
      cenaNetto: traktowanie.cenaNetto,
      viesWazny: vies?.wazny ?? null,
      kurs,
      kredytK: waluta !== 'PLN' && kurs === null ? null : kredytZaWplate(kwotaPln, traktowanie).toFixed(2),
      szacunek: waluta !== 'PLN',
    };
  }
}
