import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccountStatus, NodeTaskKind, NodeTaskStatus, Prisma, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { LIMIT_WYSYLKI_PROBY } from './okres-probny.js';

/** Po nieudanej próbie ustawienia limitu (węzeł nie potwierdził) ponawiamy najwcześniej po tym czasie. */
const PONOW_PO_MS = 6 * 60 * 60 * 1000;

/**
 * 1.11 — dobowy limit wysyłki poczty w okresie próbnym (LIMIT_WYSYLKI_PROBY).
 *
 * Ten sam mechanizm co zmiana limitu przez obsługę (poczta-konta-operatora.service.ts → zadanie węzła MAIL_QUEUE
 * w trybie `limit`, plik /etc/virtual/limit_<login> wg dokumentacji DA w ops/scripts/node-mail-queue.sh).
 * Account.mailSendLimit zapisuje NodeTasksService dopiero wtedy, gdy węzeł potwierdzi DOKŁADNIE zleconą wartość —
 * błąd węzła zostaje widoczny jako zadanie FAILED w panelu operatora, nigdy jako cichy sukces.
 *
 * Konto próbne powstaje synchronicznie albo w kolejce prowizjonowania, więc limit ustawia uzgadnianie co 5 minut:
 * każda trwająca próba z aktywnym kontem, które nie ma jeszcze potwierdzonego limitu próby. Przy konwersji
 * (TrialService.convertFromWallet) przywracamy domyślny limit serwera.
 */
@Injectable()
export class LimitWysylkiProbyService {
  private readonly logger = new Logger(LimitWysylkiProbyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron('*/5 * * * *', { name: 'limit-wysylki-proby' })
  async tick(): Promise<void> {
    await this.uzgodnij().catch((err) => this.logger.error(`limit wysyłki prób: ${(err as Error).message}`));
  }

  /** Zleca limit próby kontom, które go jeszcze nie mają. Zwraca liczbę zleconych zadań. */
  async uzgodnij(): Promise<number> {
    const proby = await this.prisma.subscription.findMany({
      where: {
        isTrial: true,
        trialConvertedAt: null,
        status: SubscriptionStatus.ACTIVE,
        account: {
          is: {
            status: AccountStatus.ACTIVE,
            OR: [{ mailSendLimit: null }, { mailSendLimit: { not: LIMIT_WYSYLKI_PROBY } }],
          },
        },
      },
      select: { id: true, userId: true, account: { select: { id: true, serverId: true, daUsername: true } } },
      take: 200,
    });
    let zlecone = 0;
    for (const s of proby) {
      const a = s.account;
      if (!a) continue;
      if (await this.trwaLubNiedawnoProbowano(a.id)) continue;
      await this.zlec(a, String(LIMIT_WYSYLKI_PROBY));
      await this.audit
        .record({ action: 'TRIAL_MAIL_LIMIT_QUEUED', userId: s.userId, details: { subscriptionId: s.id, limit: LIMIT_WYSYLKI_PROBY } })
        .catch(() => undefined);
      zlecone++;
    }
    if (zlecone) this.logger.log(`Limit wysyłki prób zlecony dla ${zlecone} kont`);
    return zlecone;
  }

  /**
   * Po przejściu na płatny: domyślny limit serwera. Zadanie idzie do kolejki konta za ewentualnym zadaniem limitu
   * próby (węzeł wykonuje zadania konta po kolei), więc ostatnie słowo ma zawsze przywrócenie.
   */
  async przywrocPoKonwersji(subscriptionId: string): Promise<boolean> {
    const a = await this.prisma.account.findFirst({
      where: { subscriptionId, status: { in: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED] } },
      select: { id: true, serverId: true, daUsername: true, mailSendLimit: true, userId: true },
    });
    if (!a) return false;
    const zlecono = await this.prisma.nodeTask.count({
      where: { accountId: a.id, kind: NodeTaskKind.MAIL_QUEUE, payload: { path: ['limit'], equals: String(LIMIT_WYSYLKI_PROBY) } },
    });
    // Limit próby nigdy nie był zlecony (np. konwersja w pierwszych minutach) — nie ma czego przywracać.
    if (zlecono === 0 && a.mailSendLimit !== LIMIT_WYSYLKI_PROBY) return false;
    await this.zlec(a, 'domyslny');
    await this.audit
      .record({ action: 'TRIAL_MAIL_LIMIT_RESTORE_QUEUED', userId: a.userId, details: { subscriptionId } })
      .catch(() => undefined);
    return true;
  }

  private async trwaLubNiedawnoProbowano(accountId: string): Promise<boolean> {
    const n = await this.prisma.nodeTask.count({
      where: {
        accountId,
        kind: NodeTaskKind.MAIL_QUEUE,
        payload: { path: ['mode'], equals: 'limit' },
        OR: [
          { status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
          { createdAt: { gte: new Date(Date.now() - PONOW_PO_MS) }, payload: { path: ['limit'], equals: String(LIMIT_WYSYLKI_PROBY) } },
        ],
      },
    });
    return n > 0;
  }

  private zlec(a: { id: string; serverId: string; daUsername: string }, limit: string) {
    return this.prisma.nodeTask.create({
      data: {
        serverId: a.serverId,
        accountId: a.id,
        kind: NodeTaskKind.MAIL_QUEUE,
        status: NodeTaskStatus.QUEUED,
        payload: { mode: 'limit', daUser: a.daUsername, limit } as Prisma.InputJsonValue,
      },
    });
  }
}
