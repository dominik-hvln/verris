import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ostatniPowodWstrzymania } from './reseller-klienci.service';

const DNI = 30;

/**
 * O-05 — usługa wstrzymana przez resellera dłużej niż 30 dni: przypomnienie dla obsługi
 * (klient płaci za odnowienie, a strona nie działa — ktoś powinien to wyjaśnić).
 * Jedno przypomnienie na usługę, zapisane w dzienniku audytu.
 */
@Injectable()
export class ResellerPrzypomnienieScheduler {
  private readonly logger = new Logger(ResellerPrzypomnienieScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *', { name: 'reseller:wstrzymane-30-dni', timeZone: 'Europe/Warsaw' })
  async sprawdz(teraz = new Date()): Promise<number> {
    const granica = new Date(teraz.getTime() - DNI * 24 * 3600 * 1000);
    const subs = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.SUSPENDED },
      select: {
        id: true,
        account: { select: { domain: true } },
        events: { where: { type: 'SUSPENDED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { details: true, createdAt: true } },
      },
      take: 2000,
    });
    const stare = subs.filter((s) => ostatniPowodWstrzymania(s.events) === 'RESELLER' && s.events[0].createdAt < granica);
    if (!stare.length) return 0;
    const juz = new Set(
      (
        await this.prisma.auditLog.findMany({
          // Od najstarszego z tych wstrzymań — przypomnienie wysłane po danym wstrzymaniu już się liczy.
          where: { action: 'RESELLER_SUSPENSION_REMINDER', createdAt: { gte: new Date(Math.min(...stare.map((s) => s.events[0].createdAt.getTime()))) } },
          select: { details: true },
        })
      ).map((a) => (a.details as { subscriptionId?: string } | null)?.subscriptionId),
    );
    const nowe = stare.filter((s) => !juz.has(s.id));
    if (!nowe.length) return 0;
    const obsluga = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'STAFF'] } }, select: { id: true } });
    for (const s of nowe) {
      for (const o of obsluga) {
        await this.notifications.create({
          userId: o.id,
          category: 'SUPPORT',
          severity: 'warning',
          title: `Usługa wstrzymana przez resellera od ponad ${DNI} dni`,
          body: `${s.account?.domain ?? s.id} — sprawdź z resellerem i klientem, czy wstrzymanie jest nadal zasadne.`,
          link: `/subscriptions/${s.id}`,
        });
      }
      await this.prisma.auditLog.create({ data: { action: 'RESELLER_SUSPENSION_REMINDER', details: { subscriptionId: s.id } } });
    }
    this.logger.log(`Przypomnienia o wstrzymaniach resellerów: ${nowe.length}`);
    return nowe.length;
  }
}
