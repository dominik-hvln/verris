import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AccountDeletionService } from '../compliance/account-deletion.service.js';
import { accountDeletionReminderTemplate } from '../mail/templates/hosting-notifications.js';
import { RETENCJA_KONTA_DNI, SubscriptionsService } from './subscriptions.service.js';

const DZIEN = 24 * 60 * 60 * 1000;
const PRZYPOMNIENIE_DNI_PRZED = 3;
const ZAKONCZONE: SubscriptionStatus[] = [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED];

export const RetencjaAkcje = {
  PRZYPOMNIENIE: 'HOSTING_ACCOUNT_DELETION_REMINDER',
  USUNIETE: 'HOSTING_ACCOUNT_DELETED',
  BLAD: 'HOSTING_ACCOUNT_DELETE_FAILED',
} as const;

/** Koniec usługi: `canceledAt`; wygasły okres próbny go nie ma — wtedy `trialEndsAt`. */
function koniecUslugi(s: { canceledAt: Date | null; trialEndsAt: Date | null }): Date | null {
  return s.canceledAt ?? s.trialEndsAt;
}

function zakonczonaNajpozniej(granica: Date) {
  return {
    status: { in: ZAKONCZONE },
    OR: [{ canceledAt: { lte: granica } }, { canceledAt: null, trialEndsAt: { lte: granica } }],
  };
}

/**
 * Retencja kont hostingowych po zakończeniu usługi — decyzja właściciela 29.09.2026: „14 dni, potem usunięcie”.
 * Do tej pory anulowanie/wygaśnięcie tylko ZAWIESZAŁO konto na węźle i nic go nigdy nie usuwało.
 *
 * Raz na dobę:
 *  1. dzień 11 — jeden mail „konto zostanie usunięte <data>” (znacznik w audycie: konto + data usunięcia),
 *  2. dzień 14+ — usunięcie konta na węźle i `Account.status = DELETED` (wspólna ścieżka z RODO:
 *     `AccountDeletionService.purgeAccountOnDa`, razem ze zwolnieniem pojemności węzła).
 * Jedno konto na raz; błąd jednego nie zatrzymuje reszty, porażka ląduje w audycie, a konto
 * wraca do kolejki następnego dnia (wciąż nie jest DELETED). Kopii poza serwerem nie ruszamy —
 * mają własną retencję.
 *
 * „Inna aktywna subskrypcja” nie może wskazywać na to konto: `Account.subscriptionId` jest unikalne
 * i nigdy nie jest przepinane. Tuż przed usunięciem sprawdzamy więc ponownie status WŁASNEJ
 * subskrypcji — gdyby usługę w międzyczasie wznowiono, konto zostaje.
 *
 * ponytail: bez blokady między instancjami (repo jej nie ma, API działa w jednej kopii); podwójny
 * przebieg jest nieszkodliwy — usunięcie jest idempotentne, najwyżej przypomnienie pójdzie dwa razy.
 */
@Injectable()
export class RetencjaKontService {
  private readonly logger = new Logger(RetencjaKontService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly subs: SubscriptionsService,
    private readonly usuwanie: AccountDeletionService,
  ) {}

  @Cron('45 4 * * *', { name: 'subscriptions:retencja-kont', timeZone: 'Europe/Warsaw' })
  async codziennie(): Promise<void> {
    const teraz = new Date();
    await this.przypomnij(teraz).catch((e) => this.logger.error(`przypomnienia: ${(e as Error).message}`));
    await this.usunPoRetencji(teraz).catch((e) => this.logger.error(`usuwanie: ${(e as Error).message}`));
  }

  async przypomnij(teraz: Date): Promise<number> {
    const konta = await this.prisma.account.findMany({
      where: {
        status: { not: AccountStatus.DELETED },
        subscription: zakonczonaNajpozniej(new Date(teraz.getTime() - (RETENCJA_KONTA_DNI - PRZYPOMNIENIE_DNI_PRZED) * DZIEN)),
      },
      select: {
        id: true,
        domain: true,
        userId: true,
        user: { select: { email: true, firstName: true, anonymizedAt: true } },
        subscription: { select: { canceledAt: true, trialEndsAt: true } },
      },
      take: 200,
    });
    const panelUrl = (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(/\/$/, '');
    let wyslane = 0;
    for (const k of konta) {
      const koniec = koniecUslugi(k.subscription);
      if (!koniec || !k.user?.email || k.user.anonymizedAt) continue;
      const usuniecie = new Date(koniec.getTime() + RETENCJA_KONTA_DNI * DZIEN);
      if (usuniecie <= teraz) continue; // na przypomnienie za późno — konto zabierze krok usuwania
      const usuniecieIso = usuniecie.toISOString();
      try {
        const bylo = await this.prisma.auditLog.findFirst({
          where: {
            action: RetencjaAkcje.PRZYPOMNIENIE,
            AND: [
              { details: { path: ['accountId'], equals: k.id } },
              { details: { path: ['usuniecieIso'], equals: usuniecieIso } },
            ],
          },
          select: { id: true },
        });
        if (bylo) continue;
        await this.mailer.send({
          ...accountDeletionReminderTemplate({
            to: k.user.email,
            firstName: k.user.firstName,
            domain: k.domain,
            deleteAt: usuniecie,
            panelUrl,
          }),
          userId: k.userId,
          category: 'TRANSACTIONAL',
          fromRole: 'BILLING',
        });
        await this.audit.record({
          action: RetencjaAkcje.PRZYPOMNIENIE,
          userId: k.userId,
          details: { accountId: k.id, domain: k.domain, usuniecieIso },
        });
        wyslane += 1;
      } catch (e) {
        // Bez wpisu w audycie — jutro kolejna próba (okno trwa do dnia usunięcia).
        this.logger.warn(`przypomnienie o usunięciu konta ${k.id}: ${(e as Error).message}`);
      }
    }
    return wyslane;
  }

  async usunPoRetencji(teraz: Date): Promise<{ usuniete: number; bledy: number }> {
    const konta = await this.prisma.account.findMany({
      where: {
        status: { not: AccountStatus.DELETED },
        subscription: zakonczonaNajpozniej(new Date(teraz.getTime() - RETENCJA_KONTA_DNI * DZIEN)),
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let usuniete = 0;
    let bledy = 0;
    for (const k of konta) {
      const wynik = await this.usunKonto(k.id, { powod: `RETENCJA_${RETENCJA_KONTA_DNI}_DNI`, actorUserId: null });
      if (wynik.ok) usuniete += 1;
      else if (wynik.error) bledy += 1;
    }
    if (konta.length) this.logger.log(`Retencja kont: usunięte ${usuniete}, błędy ${bledy}`);
    return { usuniete, bledy };
  }

  /**
   * Usunięcie konta na węźle + DELETED w bazie. Tylko dla zakończonej usługi (sprawdzane tu, tuż przed
   * usunięciem). Porażka → wpis BLAD w audycie; konto zostaje w dotychczasowym stanie. Nie rzuca.
   */
  async usunKonto(
    accountId: string,
    ctx: { powod: string; actorUserId: string | null },
  ): Promise<{ ok: boolean; error?: string }> {
    const konto = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { domain: true, userId: true, subscriptionId: true, subscription: { select: { status: true } } },
    });
    if (!konto || !ZAKONCZONE.includes(konto.subscription.status)) return { ok: false };
    const szczegoly = { subscriptionId: konto.subscriptionId, domain: konto.domain, powod: ctx.powod };
    let wynik: { ok: boolean; error?: string };
    try {
      wynik = await this.usuwanie.purgeAccountOnDa(accountId, {
        action: RetencjaAkcje.USUNIETE,
        actorUserId: ctx.actorUserId,
        details: szczegoly,
      });
    } catch (e) {
      wynik = { ok: false, error: (e as Error).message.slice(0, 500) };
    }
    if (!wynik.ok) {
      await this.audit
        .record({
          action: RetencjaAkcje.BLAD,
          userId: konto.userId,
          actorUserId: ctx.actorUserId,
          details: { ...szczegoly, accountId, error: wynik.error ?? null },
        })
        .catch(() => undefined);
    }
    return wynik;
  }

  /**
   * Operator: zakończ usługę i usuń konto od razu (nieodwracalne). Powód obowiązkowy, potwierdzenie
   * = domena konta (albo handle usługi, gdy konta nie ma). Ponowienie po błędzie usuwania jest
   * bezpieczne: zakończona usługa nie jest kończona drugi raz.
   */
  async zakonczIUsunTeraz(
    subscriptionId: string,
    dto: { powod?: string; potwierdzenie?: string },
    actorUserId: string,
  ): Promise<{ kontoUsuniete: boolean; blad: string | null }> {
    const powod = dto.powod?.trim() ?? '';
    if (powod.length < 3) throw new BadRequestException('Podaj powód (min. 3 znaki) — trafia do audytu.');
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, serviceTag: true, account: { select: { id: true, domain: true, status: true } } },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    const oczekiwane = sub.account?.domain ?? sub.serviceTag ?? sub.id;
    if ((dto.potwierdzenie ?? '').trim().toLowerCase() !== oczekiwane.toLowerCase()) {
      throw new BadRequestException(`Aby potwierdzić, wpisz dokładnie: ${oczekiwane}`);
    }
    await this.subs.zakonczPrzezOperatora(subscriptionId, actorUserId, powod);
    if (!sub.account || sub.account.status === AccountStatus.DELETED) {
      return { kontoUsuniete: !!sub.account, blad: null };
    }
    const wynik = await this.usunKonto(sub.account.id, { powod, actorUserId });
    return { kontoUsuniete: wynik.ok, blad: wynik.ok ? null : (wynik.error ?? 'Nie udało się usunąć konta') };
  }
}
