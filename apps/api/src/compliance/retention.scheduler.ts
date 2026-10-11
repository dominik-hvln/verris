import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { DataExportService } from './data-export.service.js';
import { RodoActions } from '../common/audit/audit.actions.js';
import { NodeTaskKind } from '@verris/database';
import { KLUCZE_OSOBOWE_PARAMETROW, RETENCJA_WYNIKOW_ZADAN_DNI } from '../servers/dane-zadan-wezla.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Audyt Fali 3 — wpisy F3.2 z adresem IP w szczegółach: pole → akcje. */
const IP_W_SZCZEGOLACH_DZIENNIKA: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['ip', ['OPERATOR_ACCOUNT_VIEWED', 'OPERATOR_ACCOUNT_CHANGED', 'NODE_IP_UNBLOCK_QUEUED', 'NODE_IP_ALLOWLIST_CHANGED']],
  ['target', ['HOSTING_IP_UNBLOCK_QUEUED']],
];

/**
 * Sprint 1 / L-10 — daily retention sweeper.
 *
 * Runs at 04:00 every night. Independently from the account-deletion cron
 * because the targets are different (this one purges low-PII rows in bulk).
 *
 * Policies enforced:
 *  - `LoginAttempt` rows older than 180 days → DELETE.
 *  - `AuditLog` rows older than 24 months → anonymize `ipAddress`/`userAgent`.
 *    Action and target IDs are kept (needed for accounting/UODO audit).
 *  - `DataExportRequest.READY` past `expiresAt` → flip to EXPIRED, delete file.
 *  - `StripeWebhookEvent` (deduplikacja webhooków) starsze niż 90 dni → DELETE.
 *  - `AiInteractionLog` (pytania/odpowiedzi asystenta AI, koszty) starsze niż 12 miesięcy → DELETE (RCPD A13).
 *  - Audyt Fal 2 — `NodeTask.outputLog` podglądu kolejki poczty (MAIL_QUEUE, mode=list: nadawcy, odbiorcy — także
 *    osoby trzecie — i tematy) starszy niż doba → NULL. Panel potrzebuje tylko ostatniego podglądu (usuwać można
 *    z podglądu ≤ 1 h); samo zadanie (kto, kiedy, fraza) zostaje.
 *  - Audyt Fali 3 — wyniki zadań węzła z danymi osobowymi (servers/dane-zadan-wezla.ts: MAIL_QUEUE poza limitem, MAIL_LOG,
 *    IP_BLOCKS, WAF_HITS, NODE_SERVICES w trybie `log`) starsze niż 30 dni → `outputLog` NULL i bez IP/adresu/frazy
 *    w parametrach. 30 dni — wariant zachowawczy do decyzji właściciela; zadanie (kto, kiedy, co) zostaje.
 *  - Audyt Fali 3 — adresy IP w szczegółach wpisów dziennika (odblokowanie i sprawdzenie IP, F3.2) po ~24 mies.,
 *    tak jak kolumna `ipAddress`.
 * Konto DA usuwa ścieżka art. 17 (account-deletion.scheduler), nie ten sweeper.
 */
@Injectable()
export class RetentionScheduler {
  private readonly logger = new Logger(RetentionScheduler.name);

  private readonly loginAttemptRetentionDays = 180;
  private readonly auditLogIpRetentionDays = 24 * 30; // ~24 months
  private readonly aiLogRetentionDays = 365;
  private readonly mailQueueHeadersRetentionMs = DAY_MS;
  private readonly nodeTaskPersonalDataRetentionDays = RETENCJA_WYNIKOW_ZADAN_DNI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dataExport: DataExportService,
  ) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    const now = new Date();

    const [loginPurged, auditAnonymized, exportsExpired, webhookEventsPurged, aiLogsPurged, mailQueueHeadersPurged, nodeTaskOutputsPurged] =
      await Promise.all([
        this.purgeLoginAttempts(now),
        this.anonymizeOldAuditLogIps(now),
        this.dataExport.expireDueExports(),
        this.purgeStripeWebhookEvents(now),
        this.purgeAiLogs(now),
        this.purgeMailQueueHeaders(now),
        this.purgeNodeTaskPersonalData(now),
      ]);

    if (loginPurged + auditAnonymized + exportsExpired + webhookEventsPurged + aiLogsPurged + mailQueueHeadersPurged + nodeTaskOutputsPurged > 0) {
      await this.audit.record({
        action: RodoActions.RETENTION_PURGE,
        details: {
          runAt: now.toISOString(),
          loginAttemptsPurged: loginPurged,
          auditLogIpsAnonymized: auditAnonymized,
          exportsExpired,
          stripeWebhookEventsPurged: webhookEventsPurged,
          aiLogsPurged,
          mailQueueHeadersPurged,
          nodeTaskOutputsPurged,
        },
      });
      this.logger.log(
        `Retention sweep: login=${loginPurged} auditIp=${auditAnonymized} exports=${exportsExpired} stripeEvents=${webhookEventsPurged} ai=${aiLogsPurged} mailQueue=${mailQueueHeadersPurged} nodeTasks=${nodeTaskOutputsPurged}`,
      );
    } else {
      this.logger.debug('Retention sweep: nothing to do');
    }
  }

  /**
   * Audit F-16: webhook dedupe rows only need to outlive Stripe's retry
   * window (72 h) by a wide margin — 90 days keeps the table tiny.
   */
  private async purgeStripeWebhookEvents(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - 90 * DAY_MS);
    const result = await this.prisma.stripeWebhookEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  /** Dziennik asystenta AI trzyma treść pytań i odpowiedzi — rok wystarcza na limity, koszty i reklamacje. */
  private async purgeAiLogs(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.aiLogRetentionDays * DAY_MS);
    const result = await this.prisma.aiInteractionLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }

  /** Nagłówki z podglądu kolejki poczty (konta i węzła) — dane osobowe bez celu po dobie. */
  private async purgeMailQueueHeaders(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.mailQueueHeadersRetentionMs);
    const result = await this.prisma.nodeTask.updateMany({
      where: { kind: NodeTaskKind.MAIL_QUEUE, createdAt: { lt: cutoff }, outputLog: { not: null }, payload: { path: ['mode'], equals: 'list' } },
      data: { outputLog: null },
    });
    return result.count;
  }

  /**
   * Audyt Fali 3 — surowe wyniki zadań węzła z danymi osobowymi (także osób trzecich: lista blokad fail2ban całego
   * węzła, IP odwiedzających z WAF, adresy z logu poczty) i dane osobowe z parametrów. Zadania w toku nie są ruszane;
   * MAIL_QUEUE `limit` (liczby, bez adresów) i NODE_SERVICES `status`/`restart` zostają. Widoki traktują wyczyszczony
   * wynik jak „nie wczytano” (blokady-ip.ts, trafienia-waf.ts, mail-log.service.ts).
   */
  private async purgeNodeTaskPersonalData(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.nodeTaskPersonalDataRetentionDays * DAY_MS);
    const klucze = [...KLUCZE_OSOBOWE_PARAMETROW];
    return this.prisma.$executeRaw`
      UPDATE "NodeTask"
      SET "outputLog" = NULL,
          "payload" = CASE WHEN jsonb_typeof("payload") = 'object' THEN "payload" - ${klucze}::text[] ELSE "payload" END
      WHERE "createdAt" < ${cutoff}
        AND "status"::text NOT IN ('QUEUED', 'RUNNING')
        AND (
          "kind"::text IN ('IP_BLOCKS', 'WAF_HITS', 'MAIL_LOG')
          OR ("kind"::text = 'MAIL_QUEUE' AND COALESCE("payload" ->> 'mode', '') <> 'limit')
          OR ("kind"::text = 'NODE_SERVICES' AND "payload" ->> 'mode' = 'log')
        )
        AND ("outputLog" IS NOT NULL OR (jsonb_typeof("payload") = 'object' AND jsonb_exists_any("payload", ${klucze}::text[])))`;
  }

  // ---------------------------------------------------------------------------
  // Sub-policies
  // ---------------------------------------------------------------------------

  private async purgeLoginAttempts(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.loginAttemptRetentionDays * DAY_MS);
    const result = await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  private async anonymizeOldAuditLogIps(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.auditLogIpRetentionDays * DAY_MS);
    // Only touch rows that still have IP/UA — saves write amplification.
    const result = await this.prisma.auditLog.updateMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
      },
      data: { ipAddress: null, userAgent: null },
    });
    // Audyt Fali 3 — ten sam adres w szczegółach wpisów F3.2 (sprawdzenie/odblokowanie IP z karty usługi i węzła).
    let wSzczegolach = 0;
    for (const [pole, akcje] of IP_W_SZCZEGOLACH_DZIENNIKA) {
      wSzczegolach += await this.prisma.$executeRaw`
        UPDATE "AuditLog"
        SET "details" = "details" - ${pole}::text
        WHERE "createdAt" < ${cutoff}
          AND "action" = ANY(${[...akcje]}::text[])
          AND jsonb_typeof("details") = 'object'
          AND jsonb_exists("details", ${pole}::text)`;
    }
    return result.count + wSzczegolach;
  }
}
