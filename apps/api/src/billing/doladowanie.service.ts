import { Injectable } from '@nestjs/common';
import { Prisma, WalletTransaction, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletLedgerService } from './wallet-ledger.service.js';
import type { WynikVies } from './vies.service.js';
import { VatNabywcyService } from './vat-nabywcy.service.js';
import { kursSredniPrzed } from './kurs-nbp.js';
import { odczytajModelFakturowania } from './tryb-fakturowania.js';
import { utworzDokumentDoladowania } from './doladowanie.js';
import { MAKS_NAZWA_POZYCJI, nazwyPozycji } from './pozycja-uslugi.js';
import { kredytZaWplate, traktowanieZKodu, type TraktowanieVat } from './vat.js';

export type WalutaWplaty = 'PLN' | 'EUR' | 'USD';
export const WALUTY_WPLATY: readonly WalutaWplaty[] = ['PLN', 'EUR', 'USD'];

/**
 * M-09/M-10/M-34 — doładowanie portfela: stawka VAT nabywcy, waluta wpłaty,
 * ile K dostaje klient i dokument przy wpłacie. Jedyne miejsce, które zamienia
 * realną wpłatę na K — Checkout, Paynow i auto-doładowanie idą tędy, żeby reguła nie
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
    /**
     * Bramka wpłaty — domyślnie STRIPE (Checkout, auto-doładowanie); PAYNOW dla doładowań przez Paynow;
     * PRZELEW — wpłata na rachunek zaksięgowana ręcznie przez Finanse (F3.6, rozliczenia-operatora.service.ts).
     */
    paymentProvider?: 'STRIPE' | 'PAYNOW' | 'PRZELEW';
    opis: string;
    zaplaconoAt: Date;
    metadata?: Record<string, unknown>;
    /**
     * K4 — wpłata do proformy (Paynow z „Zapłać” albo przelew zaksięgowany przez Finanse). W tej samej transakcji co
     * wpis księgi i dokument: proforma WYSTAWIONA → OPLACONA z powiązaniem do wpisu i dokumentu. Proforma już opłacona
     * albo anulowana nie blokuje wpłaty (pieniądze są u nas — K wchodzą jak zwykłe doładowanie); stan sprawdza wołający.
     */
    proformaId?: string | null;
    /**
     * Wpłata za konkretną usługę (Paynow `kind: 'zamowienie'`): nazwa pozycji dokumentu — usługa, okres, domena.
     * Przy proformie opłaconej dokładną kwotą nazwy biorą się z jej pozycji (bez tego parametru).
     */
    nazwaPozycji?: string | null;
    /** Wpłata za konkretną usługę — dokument wskazuje tę usługę (sprawdzoną przez wołającego jako usługę klienta). */
    subscriptionId?: string | null;
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
            paymentProvider: i.paymentProvider ?? 'STRIPE',
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
        // K4 — blokada wiersza proformy: anulowanie przez operatora czeka na koniec tej transakcji i widzi OPLACONA.
        const [proforma] = i.proformaId
          ? await tx.$queryRaw<Array<{ id: string; number: string; amount: Prisma.Decimal; currency: string; lineItems: unknown }>>`
              SELECT "id", "number", "amount", "currency", "lineItems" FROM "Proforma"
              WHERE "id" = ${i.proformaId} AND "userId" = ${i.userId} AND "status" = 'WYSTAWIONA'
              FOR UPDATE`
          : [];
        let dokument: { id: string } | null = null;
        if ((await odczytajModelFakturowania(tx)) === 'przy_doladowaniu') {
          dokument = await utworzDokumentDoladowania(tx, {
            userId: i.userId, walletTxId: w.id, kwota, waluta, kurs, traktowanie, vies, kredytK, teraz,
            proformaNumer: proforma?.number ?? null,
            nazwaPozycji: i.nazwaPozycji ?? nazwaZProformy(proforma, kwota, waluta),
            subscriptionId: i.subscriptionId ?? null,
          });
        }
        if (proforma) {
          await tx.proforma.update({
            where: { id: proforma.id },
            data: { status: 'OPLACONA', paidAt: i.zaplaconoAt, walletTxId: w.id, invoiceId: dokument?.id ?? null },
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

/**
 * Proforma opłacona dokładnie swoją kwotą (Paynow „Zapłać” zawsze; przelew — gdy klient wpłacił tyle, ile trzeba):
 * dokument nazywa to, za co jest proforma (np. „Hosting Verris — odnowienie roczne (przyklad.pl), okres …”), z numerem
 * proformy. Inna kwota (nadpłata, część) — zostaje „Doładowanie konta … (wpłata do proformy …)”, bo pozycje proformy
 * nie opisują tej wpłaty.
 */
export function nazwaZProformy(
  pf: { number: string; amount: Prisma.Decimal | string; currency: string; lineItems: unknown } | undefined,
  kwota: Prisma.Decimal,
  waluta: string,
): string | null {
  if (!pf || pf.currency.toUpperCase() !== waluta.toUpperCase() || !new Prisma.Decimal(pf.amount).equals(kwota)) return null;
  const nazwy = nazwyPozycji(pf.lineItems);
  if (!nazwy) return null;
  const dopisek = ` (proforma ${pf.number})`;
  const miejsce = MAKS_NAZWA_POZYCJI - dopisek.length;
  return `${nazwy.length > miejsce ? `${nazwy.slice(0, miejsce - 1)}…` : nazwy}${dopisek}`;
}
