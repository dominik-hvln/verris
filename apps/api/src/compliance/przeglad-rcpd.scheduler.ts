import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * P-11 — przegląd okresowy rejestru czynności przetwarzania (docs/legal/rcpd.md, sekcja D):
 * 26 marca i 26 września. Decyzja właściciela 27.09.2026: kalendarz + zadanie w panelu obsługi.
 * Powiadomienie dostają administratorzy (dziś tylko oni mają dostęp do danych osobowych).
 */
@Injectable()
export class PrzegladRcpdScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 8 26 3,9 *', { name: 'compliance:przeglad-rcpd', timeZone: 'Europe/Warsaw' })
  async przypomnij(): Promise<number> {
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN', loginBlocked: false }, select: { id: true } });
    for (const a of admini) {
      await this.notifications.create({
        userId: a.id,
        category: 'SYSTEM',
        severity: 'warning',
        title: 'Przegląd okresowy RCPD',
        body: 'Przejdź listę kontrolną z docs/legal/rcpd.md (sekcja D) i dopisz wpis w dzienniku przeglądów (sekcja E).',
        link: '/compliance',
      });
    }
    return admini.length;
  }
}
