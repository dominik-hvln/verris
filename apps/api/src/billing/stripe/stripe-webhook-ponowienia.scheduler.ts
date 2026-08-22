import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@verris/database';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../mail/mailer.service';
import { AuditService } from '../../common/audit/audit.service';
import { BillingService } from '../billing.service';
import { webhookZacietyTemplate } from '../../mail/templates/ops-notifications';
import {
  czyAlarmowac,
  DNI_PRZECHOWANIA_TRESCI,
  granicaCzyszczeniaTresci,
  kryteriaPodjecia,
} from './webhook-ewidencja';

/**
 * Z-05 — automatyczne ponowienia zdarzeń webhooka Stripe'a.
 *
 * Stripe ponawia sam, z narastającym odstępem, przez około trzy dni. Ten
 * scheduler nie zastępuje tamtego mechanizmu, tylko domyka trzy dziury, których
 * tamten nie pokrywa:
 *
 *  1. **Zdarzenie porzucone w połowie.** Proces API ubity między zajęciem
 *     a zakończeniem zostawia wiersz w PENDING. Dla Stripe'a dostawa
 *     zakończyła się przerwanym połączeniem, więc ponowi — ale jeśli akurat
 *     wyczerpał już próby, nikt tego nie podniesie.
 *  2. **Ponowienie ręczne z panelu.** Bez zapisanej treści i bez ścieżki
 *     wykonania nie ma czego kliknąć.
 *  3. **Alert.** Stripe pokazuje nieudane dostawy w swoim panelu. Nikt w niego
 *     nie patrzy o trzeciej w nocy.
 *
 * Czyszczenie treści zdarzeń jest tutaj, a nie w retencji ogólnej, bo termin
 * (90 dni) jest własnością tego mechanizmu — to on decyduje, jak długo
 * ponowienie ma być możliwe.
 */
@Injectable()
export class StripeWebhookPonowieniaScheduler {
  private readonly logger = new Logger(StripeWebhookPonowieniaScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (
      this.config.get<string>('adminPanelUrl') ??
      process.env.ADMIN_PANEL_URL ??
      'https://admin.verris.pl'
    ).replace(/\/$/, '');
  }

  /**
   * Co minutę: podejmij to, co czeka.
   *
   * Limit 25 wierszy na przebieg jest celowy. Gdyby coś systemowego wywaliło
   * wszystkie zdarzenia naraz (padnięta baza, zerwany Redis), ponawianie ich
   * setkami w pętli dołożyłoby obciążenia dokładnie w momencie awarii.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async ponow(): Promise<void> {
    const teraz = new Date();
    const { nieudaneDo, porzuconePrzed } = kryteriaPodjecia(teraz);

    const doPodjecia = await this.prisma.stripeWebhookEvent.findMany({
      where: {
        payload: { not: null },
        OR: [
          { status: 'FAILED', nextAttemptAt: { lte: nieudaneDo } },
          { status: 'PENDING', claimedAt: { lt: porzuconePrzed } },
          // PENDING bez claimedAt to wiersz, który nigdy nie ruszył — nie
          // powinien istnieć, ale gdyby powstał, ma zostać podjęty, a nie
          // wisieć w nieskończoność niewidzialny dla obu warunków wyżej.
          { status: 'PENDING', claimedAt: null },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
      select: { eventId: true, type: true, attempts: true, status: true },
    });

    if (doPodjecia.length === 0) return;
    this.logger.log(`Ponawiam ${doPodjecia.length} zdarzeń webhooka Stripe'a`);

    for (const z of doPodjecia) {
      try {
        await this.billing.przetworzPonownie(z.eventId);
        this.logger.log(`Ponowienie udane: ${z.eventId} (${z.type})`);
        await this.audit.record({
          action: 'STRIPE_WEBHOOK_PONOWIENIE_UDANE',
          details: { eventId: z.eventId, typ: z.type, proba: z.attempts + 1 },
        });
      } catch (err) {
        // `przetworzPonownie` zapisało już stan FAILED i kolejny termin.
        this.logger.warn(
          `Ponowienie nieudane: ${z.eventId} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** Co 5 minut: obudź adminów, jeśli coś wisi za długo albo za wiele razy. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async alarmuj(): Promise<void> {
    const teraz = new Date();
    const kandydaci = await this.prisma.stripeWebhookEvent.findMany({
      where: { status: { in: ['FAILED', 'PENDING'] } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        eventId: true,
        type: true,
        status: true,
        attempts: true,
        createdAt: true,
        alertedAt: true,
        lastError: true,
      },
    });

    const zaciete = kandydaci.filter((z) =>
      czyAlarmowac(
        {
          status: z.status as 'PENDING' | 'FAILED',
          attempts: z.attempts,
          createdAt: z.createdAt,
          alertedAt: z.alertedAt,
        },
        teraz,
      ),
    );
    if (zaciete.length === 0) return;

    const admini = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    if (admini.length === 0) {
      this.logger.error(
        `${zaciete.length} zaciętych zdarzeń webhooka, a w bazie nie ma żadnego administratora do powiadomienia`,
      );
      return;
    }

    for (const z of zaciete) {
      for (const a of admini) {
        await this.mailer
          .send(
            webhookZacietyTemplate({
              to: a.email,
              firstName: a.firstName,
              eventId: z.eventId,
              typ: z.type,
              proby: z.attempts,
              pierwszyRaz: z.createdAt,
              ostatniBlad: z.lastError,
              panelUrl: this.panelUrl(),
            }),
          )
          .catch((err) =>
            this.logger.error(
              `Nie udało się wysłać alertu o ${z.eventId} do ${a.email}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }
      await this.prisma.stripeWebhookEvent.update({
        where: { eventId: z.eventId },
        data: { alertedAt: teraz },
      });
      await this.audit.record({
        action: 'STRIPE_WEBHOOK_ZACIETY_ALERT',
        details: {
          eventId: z.eventId,
          typ: z.type,
          proby: z.attempts,
          status: z.status,
          ostatniBlad: z.lastError?.slice(0, 500) ?? null,
        },
      });
      this.logger.error(
        `ALERT: zdarzenie ${z.eventId} (${z.type}) nieobsłużone po ${z.attempts} próbach`,
      );
    }
  }

  /**
   * Codziennie 03:20: skasuj treść przetworzonych zdarzeń starszych niż 90 dni.
   *
   * Kasujemy WYŁĄCZNIE treść. Wiersz — id, typ, status, daty — zostaje na
   * zawsze, bo to on odrzuca ponowienia; usunięcie go otworzyłoby drogę do
   * ponownego zaksięgowania starej płatności.
   */
  @Cron('20 3 * * *')
  async wyczyscTresci(): Promise<void> {
    const granica = granicaCzyszczeniaTresci(new Date());
    const { count } = await this.prisma.stripeWebhookEvent.updateMany({
      where: {
        status: 'PROCESSED',
        processedAt: { lt: granica },
        payload: { not: null },
      },
      // `Prisma.DbNull` zapisuje SQL-owy NULL. `undefined` znaczyłoby
      // „nie zmieniaj" — czyli job przechodziłby na zielono i nie kasował
      // niczego. Klasyczna pułapka w tej warstwie.
      data: { payload: Prisma.DbNull, payloadPurgedAt: new Date() },
    });
    if (count > 0) {
      this.logger.log(
        `Retencja: wyczyszczono treść ${count} zdarzeń webhooka starszych niż ${DNI_PRZECHOWANIA_TRESCI} dni`,
      );
      await this.audit.record({
        action: 'STRIPE_WEBHOOK_RETENCJA',
        details: { wyczyszczono: count, granica: granica.toISOString() },
      });
    }
  }
}
