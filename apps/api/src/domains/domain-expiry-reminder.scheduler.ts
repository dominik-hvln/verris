import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DomainStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { domainExpiryReminderTemplate, type DomainExpiryWindow } from '../mail/templates/hosting-notifications.js';
import { DomainRegistrarService } from './domain-registrar.service.js';

const OKNA: { window: DomainExpiryWindow; dni: number; akcja: string }[] = [
  { window: 'T_MINUS_30', dni: 30, akcja: 'DOMAIN_EXPIRY_REMINDER_T30' },
  { window: 'T_MINUS_14', dni: 14, akcja: 'DOMAIN_EXPIRY_REMINDER_T14' },
  { window: 'T_MINUS_7', dni: 7, akcja: 'DOMAIN_EXPIRY_REMINDER_T7' },
];
const DZIEN = 24 * 60 * 60 * 1000;

/**
 * Przypomnienia o wygaśnięciu domeny 30, 14 i 7 dni przed terminem — obietnica z verris.pl
 * („bez auto-odnowień, przypomnimy”), do 2026-09-25 bez żadnego kodu, który by je wysyłał.
 * Raz na dobę; okno = pełna doba wokół terminu minus N dni. Jeden mail na (domena, termin, okno):
 * wpis w dzienniku z datą wygaśnięcia, więc odnowienie (nowy termin) zaczyna cykl od nowa.
 */
@Injectable()
export class DomainExpiryReminderScheduler {
  private readonly logger = new Logger(DomainExpiryReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly registrar: DomainRegistrarService,
  ) {}

  @Cron('5 9 * * *', { name: 'domains:expiry-reminders' })
  async codziennie(): Promise<void> {
    for (const okno of OKNA) {
      try {
        await this.okno(okno, Date.now());
      } catch (e) {
        this.logger.error(`przypomnienia ${okno.window}: ${(e as Error).message}`);
      }
    }
  }

  async okno(okno: (typeof OKNA)[number], teraz: number): Promise<number> {
    const srodek = teraz + okno.dni * DZIEN;
    const domeny = await this.prisma.domain.findMany({
      where: {
        status: DomainStatus.ACTIVE,
        expiresAt: { gte: new Date(srodek - DZIEN / 2), lt: new Date(srodek + DZIEN / 2) },
      },
      include: { user: { select: { email: true, firstName: true, anonymizedAt: true } } },
      take: 500,
    });
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    let wyslane = 0;
    for (const d of domeny) {
      if (!d.expiresAt || !d.user?.email || d.user.anonymizedAt) continue;
      const terminIso = d.expiresAt.toISOString();
      const bylo = await this.prisma.auditLog.findFirst({
        where: { userId: d.userId, action: okno.akcja, details: { path: ['terminIso'], equals: terminIso } },
        select: { id: true },
      });
      if (bylo) continue;
      const cena = await this.registrar
        .renewQuote(d.userId, d.id, 1)
        .then((q) => `${Number(q.priceAmount).toFixed(2).replace('.', ',')} ${q.currency === 'PLN' ? 'zł' : q.currency} / rok`)
        .catch(() => 'aktualna cena w panelu');
      await this.mailer.send(
        domainExpiryReminderTemplate({
          to: d.user.email,
          firstName: d.user.firstName,
          domain: d.name,
          expiresAt: d.expiresAt,
          window: okno.window,
          renewalPrice: cena,
          panelUrl,
        }),
      );
      await this.audit.record({
        action: okno.akcja,
        userId: d.userId,
        details: { domain: d.name, terminIso },
      });
      wyslane += 1;
    }
    return wyslane;
  }
}
