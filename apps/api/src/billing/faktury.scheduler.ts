import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, Role, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { InvoicesService } from './invoices.service';
import { fakturaNiedokonczonaTemplate } from '../mail/templates/ops-notifications';
import {
  czyAlarmowacOFakturze,
  DOSTAWCA_PORTFEL,
  nadajNumerFaktury,
  nastepnaProbaFaktury,
  okresZbiorczy,
  PROG_ALERTU_FAKTURY,
  pozycjeZbiorcze,
  refZbiorcza,
  STAWKA_VAT,
  TYPY_SPRZEDAZY,
} from './faktura-za-portfel';

/**
 * Z-01 — dwa zadania cykliczne wokół faktur.
 *
 *  1. **Dokończenie** — wiersz faktury powstaje atomowo z obciążeniem portfela,
 *     ale PDF, MinIO, KSeF i mail wymagają świata zewnętrznego. Ten job je
 *     dowozi i PONAWIA. Do 2026-08-22 finalizacja była wołana raz, z
 *     `.catch(log)`: błąd generowania kończył się linijką w logu i fakturą bez
 *     pliku, o której nikt się nie dowiadywał. Ta sama klasa błędu co Z-05,
 *     tylko w dokumentach zamiast w pieniądzach.
 *
 *  2. **Faktura zbiorcza** — autoskalowanie i drobne zużycie nie dostają
 *     dokumentu przy każdym obciążeniu (byłoby ich kilkadziesiąt miesięcznie
 *     na klienta). Pierwszego dnia miesiąca powstaje jedna faktura za miesiąc
 *     poprzedni, z pozycjami.
 */
@Injectable()
export class FakturyScheduler {
  private readonly logger = new Logger(FakturyScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Dokończenie faktur bez PDF-u
  // ───────────────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE, { name: 'faktury-dokoncz' })
  async dokoncz(): Promise<void> {
    const teraz = new Date();
    const doZrobienia = await this.prisma.invoice.findMany({
      where: {
        status: 'PAID',
        storageKey: null,
        OR: [{ finalizeNextAttemptAt: null }, { finalizeNextAttemptAt: { lte: teraz } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, number: true, userId: true, finalizeAttempts: true },
    });
    if (doZrobienia.length === 0) return;

    this.logger.log(`Dokańczam ${doZrobienia.length} faktur bez PDF-u`);
    for (const f of doZrobienia) {
      // Zajęcie próby PRZED wywołaniem, nie po. Gdyby licznik rósł dopiero po
      // błędzie, awaria ubijająca proces w trakcie generowania zostawiałaby
      // fakturę z tą samą liczbą prób i job wracałby do niej co minutę bez
      // końca — a alert, oparty na liczbie prób, nigdy by nie padł.
      await this.prisma.invoice.update({
        where: { id: f.id },
        data: {
          finalizeAttempts: { increment: 1 },
          finalizeNextAttemptAt: nastepnaProbaFaktury(f.finalizeAttempts + 1, teraz),
        },
      });

      try {
        const wynik = await this.invoices.dokonczFakture(f.id);
        if (wynik.storageKey) {
          await this.prisma.invoice.update({
            where: { id: f.id },
            data: { finalizeLastError: null, finalizeNextAttemptAt: null },
          });
          this.logger.log(`Faktura ${f.number} dokończona`);
        }
      } catch (err) {
        const komunikat = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        await this.prisma.invoice.update({
          where: { id: f.id },
          data: { finalizeLastError: komunikat.slice(0, 4000) },
        });
        this.logger.warn(
          `Faktura ${f.number} — próba ${f.finalizeAttempts + 1} nieudana: ${komunikat}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'faktury-alert' })
  async alarmuj(): Promise<void> {
    const teraz = new Date();
    const kandydaci = await this.prisma.invoice.findMany({
      where: { status: 'PAID', storageKey: null, finalizeAttempts: { gte: PROG_ALERTU_FAKTURY } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        id: true,
        number: true,
        userId: true,
        amount: true,
        currency: true,
        finalizeAttempts: true,
        finalizeAlertedAt: true,
        finalizeLastError: true,
        createdAt: true,
      },
    });
    const zaciete = kandydaci.filter((f) => czyAlarmowacOFakturze(f, teraz));
    if (zaciete.length === 0) return;

    const admini = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null },
      select: { email: true, firstName: true },
    });
    if (admini.length === 0) {
      this.logger.error(
        `${zaciete.length} faktur bez PDF-u, a w bazie nie ma administratora do powiadomienia`,
      );
      return;
    }

    for (const f of zaciete) {
      for (const a of admini) {
        await this.mailer
          .send(
            fakturaNiedokonczonaTemplate({
              to: a.email,
              firstName: a.firstName,
              numer: f.number,
              kwota: `${f.amount.toFixed(2)} ${f.currency}`,
              proby: f.finalizeAttempts,
              wystawiona: f.createdAt,
              ostatniBlad: f.finalizeLastError,
              panelUrl: process.env.ADMIN_PANEL_URL ?? 'https://admin.verris.pl',
            }),
          )
          .catch((err) =>
            this.logger.error(
              `Nie udało się wysłać alertu o fakturze ${f.number}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }
      await this.prisma.invoice.update({
        where: { id: f.id },
        data: { finalizeAlertedAt: teraz },
      });
      await this.audit.record({
        action: 'FAKTURA_NIEDOKONCZONA_ALERT',
        userId: f.userId,
        details: {
          invoiceId: f.id,
          numer: f.number,
          proby: f.finalizeAttempts,
          ostatniBlad: f.finalizeLastError?.slice(0, 500) ?? null,
        },
      });
      this.logger.error(
        `ALERT: faktura ${f.number} bez PDF-u po ${f.finalizeAttempts} próbach`,
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Faktura zbiorcza za miesiąc
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Pierwszego dnia miesiąca o 04:00 — jedna faktura na klienta za obciążenia
   * poprzedniego miesiąca, które nie dostały własnego dokumentu.
   *
   * Godzina jest po tym, jak autoskalowanie domknie ostatni blok poprzedniego
   * miesiąca, i przed porannym podsumowaniem ops.
   */
  @Cron('0 4 1 * *', { name: 'faktury-zbiorcze' })
  async wystawZbiorcze(): Promise<void> {
    const teraz = new Date();
    const okres = okresZbiorczy(teraz);

    const doFakturowania = await this.prisma.walletTransaction.findMany({
      where: {
        invoiceId: null,
        type: { in: [...TYPY_SPRZEDAZY] },
        amount: { lt: 0 },
        createdAt: { gte: okres.od, lt: okres.do },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        currency: true,
        description: true,
        subscriptionId: true,
      },
    });
    if (doFakturowania.length === 0) {
      this.logger.log(`Faktury zbiorcze ${okres.etykieta}: nie ma czego fakturować`);
      return;
    }

    const wgKlienta = new Map<string, typeof doFakturowania>();
    for (const w of doFakturowania) {
      const lista = wgKlienta.get(w.userId) ?? [];
      lista.push(w);
      wgKlienta.set(w.userId, lista);
    }

    this.logger.log(
      `Faktury zbiorcze ${okres.etykieta}: ${doFakturowania.length} obciążeń, ` +
        `${wgKlienta.size} klientów`,
    );

    for (const [userId, wpisy] of wgKlienta) {
      try {
        await this.zbiorczaDlaKlienta(userId, wpisy, okres, teraz);
      } catch (err) {
        // Jeden klient nie może zatrzymać reszty. Błąd jest głośny, bo faktura
        // niewystawiona w terminie to problem ustawowy, nie kosmetyczny.
        this.logger.error(
          `Faktura zbiorcza ${okres.etykieta} dla ${userId} nie powstała: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await this.audit.record({
          action: 'FAKTURA_ZBIORCZA_BLAD',
          userId,
          details: {
            okres: okres.etykieta,
            obciazen: wpisy.length,
            blad: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  private async zbiorczaDlaKlienta(
    userId: string,
    wpisy: Array<{
      id: string;
      type: WalletTxType;
      amount: Prisma.Decimal;
      currency: string;
      description: string | null;
      subscriptionId: string | null;
    }>,
    okres: { od: Date; do: Date; etykieta: string },
    teraz: Date,
  ): Promise<void> {
    // Kwoty w księdze są ujemne (obciążenie). Faktura operuje na dodatnich.
    const obciazenia = wpisy.map((w) => ({
      typ: w.type,
      brutto: w.amount.abs(),
      opis: w.description,
    }));
    const { pozycje, suma } = pozycjeZbiorcze(obciazenia);
    const ref = refZbiorcza(userId, okres.etykieta);

    await this.prisma.$transaction(async (tx) => {
      // Para (provider, providerRef) jest unikalna, więc powtórne uruchomienie
      // joba w tym samym miesiącu odbije się o bazę zamiast wystawić drugą
      // fakturę na te same obciążenia.
      const istnieje = await tx.invoice.findUnique({
        where: { provider_providerRef: { provider: DOSTAWCA_PORTFEL, providerRef: ref } },
        select: { id: true },
      });
      if (istnieje) {
        this.logger.log(`Faktura zbiorcza ${okres.etykieta} dla ${userId} już istnieje`);
        return;
      }

      const numer = await nadajNumerFaktury(tx, teraz);
      const faktura = await tx.invoice.create({
        data: {
          userId,
          subscriptionId: wpisy.find((w) => w.subscriptionId)?.subscriptionId ?? null,
          number: numer,
          status: 'PAID',
          amount: suma.brutto,
          netAmount: suma.netto,
          vatAmount: suma.vat,
          vatRate: new Prisma.Decimal(STAWKA_VAT),
          currency: wpisy[0]?.currency ?? 'PLN',
          provider: DOSTAWCA_PORTFEL,
          providerRef: ref,
          lineItems: pozycje as unknown as Prisma.InputJsonValue,
          issuedAt: teraz,
          // Datą sprzedaży dla faktury zbiorczej jest koniec okresu, nie dzień
          // wystawienia — usługa została wykonana w miesiącu poprzednim.
          paidAt: new Date(okres.do.getTime() - 1000),
        },
        select: { id: true, number: true },
      });

      // Wiązanie obciążeń z fakturą w tej samej transakcji. Gdyby powiązanie
      // szło osobno, przerwanie w połowie zostawiłoby część wpisów wolnych
      // i następny przebieg wystawiłby im drugą fakturę.
      await tx.walletTransaction.updateMany({
        where: { id: { in: wpisy.map((w) => w.id) }, invoiceId: null },
        data: { invoiceId: faktura.id },
      });

      this.logger.log(
        `Faktura zbiorcza ${faktura.number} dla ${userId}: ` +
          `${wpisy.length} obciążeń, ${suma.brutto.toFixed(2)} ${wpisy[0]?.currency ?? 'PLN'}`,
      );
    });

    await this.audit.record({
      action: 'FAKTURA_ZBIORCZA_WYSTAWIONA',
      userId,
      details: { okres: okres.etykieta, obciazen: wpisy.length, brutto: suma.brutto.toFixed(2) },
    });
  }
}
