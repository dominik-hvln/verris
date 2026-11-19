import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, Optional, ServiceUnavailableException, forwardRef, type OnModuleInit } from '@nestjs/common';
import { Prisma, WalletTxType, type KreatorMarkaZakup, type KreatorMarkaZakupRodzaj } from '@verris/database';
import type { WersjaKreatora, WynikZakupuMarki, ZakupPakietuBody } from '@verris/kreator';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import { BillingService } from '../billing/billing.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { KreatorMarkiActions } from '../common/audit/audit.actions.js';
import type { KonfiguracjaMarki } from './konfiguracja-marki.js';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';

/**
 * Kreator marki (paczka 131) – zakupy jednorazowe (treść cyfrowa): Pakiet marki i druga marka.
 *
 * Wzorzec: dodatki (addons/addon.service.ts – rekord zakupu zajęty PRZED pieniędzmi, obciążenie portfela z kluczem
 * idempotencji, faktura w tej samej transakcji co obciążenie – WalletLedgerService, CHARGE_USAGE ≥ 5 zł = faktura od
 * razu). Karta i BLIK/przelew (Paynow) to doładowanie portfela kwotą zakupu (BillingService.createTopupCheckoutSession
 * – ta sama ścieżka co „Doładuj portfel”) z referencją zamówienia w metadanych płatności (`kreatorMarkiZakup`). Po
 * zaksięgowaniu wpłaty – w tym samym miejscu, w którym billing kończy każde doładowanie po powiadomieniu operatora
 * (Paynow: powiadomienie albo sprawdzenie statusu po powrocie klienta na /dashboard/billing?paynow=…; Stripe: webhook
 * checkout.session.completed) – BillingService woła zarejestrowaną realizację: obciążenie portfela i aktywacja
 * (idempotentnie: klucz obciążenia = zakup, zmiana statusu tylko z OCZEKUJE).
 *
 * Zgoda na rozpoczęcie dostarczania treści cyfrowej przed upływem terminu odstąpienia (ustawa o prawach konsumenta,
 * art. 38 ust. 1 pkt 13 [do weryfikacji numeru jednostki redakcyjnej po nowelizacjach]) – wymagana, zapisana z datą.
 */

export const NAZWY_ZAKUPOW: Record<KreatorMarkaZakupRodzaj, string> = { PAKIET: 'Kreator marki – Pakiet marki', DRUGA_MARKA: 'Kreator marki – kolejna marka' };
export const WAZNOSC_OCZEKUJACEGO_MS = 7 * 24 * 3600_000;
const METODY = new Set(['portfel', 'karta', 'paynow']);

export const POWOD_PROBA_ZAKUP = 'Pakiet marki i kolejne marki kupisz po opłaceniu hostingu – w okresie próbnym tworzysz projekt.';
export const POWOD_PAKIET_KUPIONY = 'Masz już Pakiet marki na tym koncie.';
export const POWOD_ZAKUP_W_TOKU = 'Poprzednia płatność za ten zakup jeszcze trwa – poczekaj na jej wynik albo opłać zakup z portfela.';
export const BRAK_ZGODY = 'Zaznacz zgodę na rozpoczęcie dostarczania treści cyfrowej przed upływem terminu odstąpienia.';

const blad = (status: number, message: string, kod: string) => new HttpException({ message, kod, code: kod }, status);

@Injectable()
export class ZakupMarkiService implements OnModuleInit {
  private readonly logger = new Logger(ZakupMarkiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly audit: AuditService,
    @Optional() @Inject(forwardRef(() => BillingService)) private readonly billing?: BillingService,
    @Optional() private readonly konfiguracjaMarki?: KonfiguracjaMarkiService,
  ) {}

  /** Realizacja zamówienia kartą/Paynow po wpłacie – w billingu, po zaksięgowaniu doładowania z referencją zakupu. */
  onModuleInit(): void {
    this.billing?.zarejestrujRealizacjePoWplacie('kreatorMarkiZakup', (i) => this.realizujPoWplacie(i.userId, i.referencja));
  }

  private cena(rodzaj: KreatorMarkaZakupRodzaj, konf: KonfiguracjaMarki): Prisma.Decimal {
    return new Prisma.Decimal(rodzaj === 'PAKIET' ? konf.pakiet.cenaBrutto : konf.drugaMarka.cenaBrutto).toDecimalPlaces(2);
  }

  /** Zakup – wynik bez `stan` (dokłada go serwis modułu po zakupie). */
  async kup(
    userId: string,
    actorUserId: string,
    rodzaj: KreatorMarkaZakupRodzaj,
    body: Partial<ZakupPakietuBody> | undefined,
    konf: KonfiguracjaMarki,
    wersjaKreatora: WersjaKreatora | null,
  ): Promise<{ status: 'oplacony' } | Exclude<WynikZakupuMarki, { status: 'oplacony' }>> {
    const metoda = body?.metoda;
    if (!metoda || !METODY.has(metoda)) throw new BadRequestException({ message: 'Wybierz sposób płatności: portfel, karta albo BLIK/przelew.', kod: 'ZLA_METODA' });
    if (body?.zgodaTresciCyfrowej !== true) throw new BadRequestException({ message: BRAK_ZGODY, kod: 'BRAK_ZGODY' });
    if (!wersjaKreatora) throw new ForbiddenException({ message: 'Kreator marki wymaga hostingu Verris.', kod: 'BRAK_HOSTINGU' });
    if (wersjaKreatora === 'proba') throw blad(HttpStatus.PAYMENT_REQUIRED, POWOD_PROBA_ZAKUP, 'PROBA');
    if (rodzaj === 'PAKIET' && (await this.prisma.kreatorMarkaZakup.count({ where: { userId, rodzaj, status: 'OPLACONY' } }))) {
      throw blad(HttpStatus.CONFLICT, POWOD_PAKIET_KUPIONY, 'PAKIET_KUPIONY');
    }
    const kwota = this.cena(rodzaj, konf);
    const teraz = new Date();

    // Zamówienie zajmowane pod blokadą doradczą konta: dwa równoległe kliknięcia nie złożą dwóch zamówień.
    const zakup = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kreator-marki-zakup:${userId}`}))`;
      if (rodzaj === 'PAKIET' && (await tx.kreatorMarkaZakup.count({ where: { userId, rodzaj, status: 'OPLACONY' } }))) {
        throw blad(HttpStatus.CONFLICT, POWOD_PAKIET_KUPIONY, 'PAKIET_KUPIONY');
      }
      const czeka = await tx.kreatorMarkaZakup.findFirst({
        where: { userId, rodzaj, status: 'OCZEKUJE', createdAt: { gt: new Date(teraz.getTime() - WAZNOSC_OCZEKUJACEGO_MS) } },
        orderBy: { createdAt: 'desc' },
      });
      if (czeka) {
        if (metoda !== 'portfel') throw blad(HttpStatus.CONFLICT, POWOD_ZAKUP_W_TOKU, 'ZAKUP_W_TOKU');
        return tx.kreatorMarkaZakup.update({ where: { id: czeka.id }, data: { metoda, kwotaBrutto: kwota, zgodaTresciCyfrowejAt: teraz } });
      }
      return tx.kreatorMarkaZakup.create({ data: { userId, rodzaj, metoda, kwotaBrutto: kwota, zgodaTresciCyfrowejAt: teraz } });
    });

    if (metoda === 'portfel') {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
      const saldo = new Prisma.Decimal(u?.walletBalance ?? 0);
      if (saldo.lessThan(kwota)) {
        await this.prisma.kreatorMarkaZakup.updateMany({ where: { id: zakup.id, status: 'OCZEKUJE' }, data: { status: 'ANULOWANY' } });
        return { status: 'brak-srodkow', brakuje: Number(kwota.minus(saldo).toFixed(2)) };
      }
      const ok = await this.oplac(zakup, konf, actorUserId);
      if (!ok.oplacony) {
        await this.prisma.kreatorMarkaZakup.updateMany({ where: { id: zakup.id, status: 'OCZEKUJE' }, data: { status: 'ANULOWANY' } });
        return { status: 'brak-srodkow', brakuje: ok.brakuje };
      }
      return { status: 'oplacony' };
    }

    if (!this.billing) throw new ServiceUnavailableException('Płatność kartą jest chwilowo niedostępna – opłać zakup z portfela.');
    try {
      const sesja = await this.billing.createTopupCheckoutSession({
        userId,
        amount: kwota.toFixed(2),
        metoda: metoda === 'karta' ? 'stripe' : 'paynow',
        currency: 'PLN',
        zamowienie: { kreatorMarkiZakup: zakup.id },
      });
      if (!sesja.url) throw new Error('Brak adresu płatności.');
      await this.audit.record({
        action: KreatorMarkiActions.KREATOR_MARKI_ZAKUP,
        userId,
        actorUserId,
        details: { zakupId: zakup.id, rodzaj, metoda, kwota: kwota.toFixed(2), etap: 'platnosc', zgodaTresciCyfrowejAt: zakup.zgodaTresciCyfrowejAt.toISOString() },
      });
      return { status: 'przekierowanie', url: sesja.url };
    } catch (e) {
      await this.prisma.kreatorMarkaZakup.updateMany({ where: { id: zakup.id, status: 'OCZEKUJE' }, data: { status: 'ANULOWANY' } });
      throw e;
    }
  }

  /**
   * Obciążenie portfela i oznaczenie zakupu jako opłaconego. Klucz idempotencji = zakup – drugie wywołanie nie pobierze
   * drugi raz. Pula Pakietu i aktualizacje szablonów z konfiguracji w chwili zapłaty.
   */
  private async oplac(z: KreatorMarkaZakup, konf: KonfiguracjaMarki, actorUserId: string): Promise<{ oplacony: true } | { oplacony: false; brakuje: number }> {
    const kwota = new Prisma.Decimal(z.kwotaBrutto);
    let walletTxId: string | null = null;
    if (kwota.greaterThan(0)) {
      try {
        const wpis = await this.ledger.debit({
          userId: z.userId,
          type: WalletTxType.CHARGE_USAGE,
          amount: kwota,
          description: NAZWY_ZAKUPOW[z.rodzaj],
          idempotencyKey: `kreator-marki:zakup:${z.id}`,
          metadata: { kreatorMarkiZakup: z.id, rodzaj: z.rodzaj },
        });
        walletTxId = wpis.id;
      } catch (e) {
        if (e instanceof ConflictException) {
          const u = await this.prisma.user.findUnique({ where: { id: z.userId }, select: { walletBalance: true } });
          return { oplacony: false, brakuje: Number(kwota.minus(new Prisma.Decimal(u?.walletBalance ?? 0)).toFixed(2)) };
        }
        throw e;
      }
    }
    const teraz = new Date();
    const pakiet = z.rodzaj === 'PAKIET';
    const aktualizacjeDo = pakiet ? new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth() + konf.pakiet.aktualizacjeSzablonowMies, teraz.getUTCDate())) : null;
    await this.prisma.kreatorMarkaZakup.updateMany({
      where: { id: z.id, status: 'OCZEKUJE' },
      data: {
        status: 'OPLACONY',
        walletTxId,
        oplaconoAt: teraz,
        serie: pakiet ? konf.pakiet.serie : 0,
        zmianyAi: pakiet ? konf.pakiet.zmianyAi : 0,
        aktualizacjeDo,
      },
    });
    await this.audit.record({
      action: KreatorMarkiActions.KREATOR_MARKI_ZAKUP,
      userId: z.userId,
      actorUserId,
      details: { zakupId: z.id, rodzaj: z.rodzaj, metoda: z.metoda, kwota: kwota.toFixed(2), walletTxId, zgodaTresciCyfrowejAt: z.zgodaTresciCyfrowejAt.toISOString() },
    });
    return { oplacony: true };
  }

  /**
   * Zamówienie kartą/Paynow po zaksięgowanej wpłacie (BillingService.poZaksiegowaniuDoladowania): opłata z portfela tego
   * konta. Idempotentne – zakup już opłacony / anulowany / cudzy = nic; drugi Pakiet = anulowanie (wpłata zostaje
   * w portfelu); za mało środków (np. równoległy wydatek) – zamówienie czeka, klient opłaci je z portfela.
   */
  async realizujPoWplacie(userId: string, zakupId: string): Promise<void> {
    const z = await this.prisma.kreatorMarkaZakup.findFirst({ where: { id: zakupId, userId, status: 'OCZEKUJE' } });
    if (!z) return;
    if (z.rodzaj === 'PAKIET' && (await this.prisma.kreatorMarkaZakup.count({ where: { userId, rodzaj: 'PAKIET', status: 'OPLACONY' } }))) {
      await this.prisma.kreatorMarkaZakup.updateMany({ where: { id: z.id, status: 'OCZEKUJE' }, data: { status: 'ANULOWANY' } });
      return;
    }
    if (!this.konfiguracjaMarki) throw new Error('Brak konfiguracji Kreatora marki.');
    const wynik = await this.oplac(z, await this.konfiguracjaMarki.konfiguracja(), userId);
    if (!wynik.oplacony) this.logger.warn(`Zakup ${z.id}: wpłata zaksięgowana, a w portfelu brakuje ${wynik.brakuje} zł – zamówienie czeka na opłatę z portfela`);
  }
}
