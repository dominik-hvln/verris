import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  IncidentSeverity,
  IncidentStatus,
  MaintenanceWindowStatus,
  Prisma,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { slaCreditTemplate } from '../mail/templates/billing-lifecycle-notifications';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * #11 — automatyczne kredyty SLA za przestój infrastruktury.
 *
 * ŹRÓDŁO PRAWDY: §15 regulaminu. Rekompensata liczona jest z DOSTĘPNOŚCI
 * W MIESIĄCU KALENDARZOWYM, według progów, a nie proporcjonalnie do czasu przestoju:
 *
 *   99,0% – <99,5%  →   5% opłaty miesięcznej
 *   95,0% – <99,0%  →  25%
 *   90,0% – <95,0%  →  50%
 *          <90,0%   → 100%
 *
 * Przy dostępności ≥ 99,5% rekompensata NIE przysługuje.
 *
 * Poprzednia implementacja liczyła `opłata × minuty × mnożnik ÷ 43200` per incydent.
 * Rozjeżdżała się z umową w czterech miejscach: płaciła przy dotrzymanym SLA,
 * zawyżała progi ok. dwukrotnie, stosowała limit per incydent (trzy awarie = do 300%
 * opłaty miesięcznej) i nie odliczała okien konserwacyjnych. Patrz
 * `docs/legal/SLA_KOD_VS_REGULAMIN.md`.
 *
 * Wyłączenia (§15 ust. 5): odliczamy okna konserwacyjne zapowiedziane z wyprzedzeniem,
 * łącznie nie więcej niż `sla.maintenanceCapMinutes` (domyślnie 480 min = 8 h/mies.).
 *
 * Idempotencja: unikat `SlaCredit(subscriptionId, periodStart)` + idempotencyKey portfela.
 * Ten sam unikat blokuje podwójną wypłatę, gdy kredyt przyznano dodatkowo ręcznie
 * na wniosek klienta.
 *
 * Domyślnie WYŁĄCZONE — nic nie jest kredytowane, dopóki `sla.creditsEnabled = 1`.
 */
@Injectable()
export class SlaCreditScheduler {
  private readonly logger = new Logger(SlaCreditScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
    private readonly mailer: MailerService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Codziennie o 03:00. Rozliczamy POPRZEDNI miesiąc kalendarzowy — dostępności
   * nie da się policzyć przed jego zamknięciem. Ponowne uruchomienia są bezpieczne
   * dzięki unikatowi (subscriptionId, periodStart).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'billing:sla-credits' })
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`SLA credit run failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  /** @param now wstrzykiwane w testach; domyślnie bieżąca chwila. */
  async run(now: Date = new Date()): Promise<void> {
    const policy = await this.platformSettings.getSlaCreditPolicy();
    if (!policy.enabled) return;

    const { periodStart, periodEnd } = previousMonthUtc(now);
    const panelUrl = (
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl'
    ).replace(/\/$/, '');

    const subs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: { productKind: 'HOSTING' },
        account: { serverId: { not: null } },
        createdAt: { lt: periodEnd },
      },
      include: {
        plan: { select: { name: true } },
        account: { select: { domain: true, serverId: true } },
        user: { select: { email: true, firstName: true, anonymizedAt: true } },
      },
    });
    if (subs.length === 0) return;

    // Przestoje i okna konserwacyjne pobieramy raz per serwer, nie per subskrypcja.
    const serverIds = [...new Set(subs.map((s) => s.account?.serverId).filter(Boolean))] as string[];
    const downtimeByServer = await this.downtimeIntervals(serverIds, periodStart, periodEnd);
    const maintenanceByServer = await this.maintenanceIntervals(serverIds, periodStart, periodEnd);

    let credited = 0;
    for (const sub of subs) {
      const serverId = sub.account?.serverId;
      if (!serverId || !sub.user || sub.user.anonymizedAt) continue;

      // Usługa mogła ruszyć w trakcie miesiąca — mianownik liczymy od jej startu.
      const serviceStart = sub.createdAt > periodStart ? sub.createdAt : periodStart;
      const exposureMin = minutesBetween(serviceStart, periodEnd);
      if (exposureMin <= 0) continue;

      const outages = clipIntervals(downtimeByServer.get(serverId) ?? [], serviceStart, periodEnd);
      const maintenance = clipIntervals(
        maintenanceByServer.get(serverId) ?? [],
        serviceStart,
        periodEnd,
      );

      // §15 ust. 5 — odejmujemy część przestoju pokrytą zapowiedzianą konserwacją,
      // ale nie więcej niż limit miesięczny.
      const rawDowntimeMin = totalMinutes(outages);
      const excusedMin = Math.min(
        totalMinutes(intersectIntervals(outages, maintenance)),
        policy.maintenanceCapMinutes,
      );
      const downtimeMin = Math.max(0, rawDowntimeMin - excusedMin);

      if (downtimeMin <= policy.graceMinutes) continue;

      const availabilityBp = Math.round(((exposureMin - downtimeMin) / exposureMin) * 10000);
      const tier = tierPercent(availabilityBp);
      if (tier === 0) continue; // SLA dotrzymane — rekompensata nie przysługuje.

      const monthlyEq =
        sub.interval === 'YEAR'
          ? new Prisma.Decimal(sub.priceAmount).div(12)
          : new Prisma.Decimal(sub.priceAmount);

      const amount = monthlyEq
        .mul(new Prisma.Decimal(tier))
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      if (amount.lessThanOrEqualTo(0)) continue;

      const periodKey = periodStart.toISOString().slice(0, 7); // YYYY-MM
      const downtimeS = Math.round(downtimeMin * 60);

      try {
        // Rekord SLA najpierw: unikat (subscriptionId, periodStart) jest jedynym
        // strażnikiem przed podwójną wypłatą (także wobec kredytu przyznanego ręcznie).
        // Gdyby kredyt portfela poszedł pierwszy, kolizja unikatu zostawiłaby
        // uznanie bez pokrycia w ewidencji.
        await this.prisma.slaCredit.create({
          data: {
            subscriptionId: sub.id,
            userId: sub.userId,
            periodStart,
            availabilityBp,
            tierPercent: tier,
            downtimeS,
            amount,
            currency: sub.currency ?? 'PLN',
          },
        });

        const tx = await this.walletLedger.credit({
          userId: sub.userId,
          type: WalletTxType.ADJUSTMENT,
          amount,
          description: `Rekompensata SLA za ${periodKey} (${sub.account?.domain ?? sub.plan?.name ?? 'usługa'})`,
          idempotencyKey: `sla-${sub.id}-${periodKey}`,
          subscriptionId: sub.id,
        });

        await this.audit.record({
          action: 'SLA_CREDIT_GRANTED',
          userId: sub.userId,
          details: {
            subscriptionId: sub.id,
            period: periodKey,
            availabilityPct: (availabilityBp / 100).toFixed(2),
            tierPercent: tier,
            amount: amount.toFixed(2),
            downtimeS,
            excusedMaintenanceMin: excusedMin,
          },
        });

        await this.notifications.create({
          userId: sub.userId,
          category: 'SLA',
          severity: 'info',
          title: 'Przyznano rekompensatę SLA',
          body: `Za dostępność ${(availabilityBp / 100).toFixed(2)}% w miesiącu ${periodKey} doliczyliśmy ${amount.toFixed(2)} ${(sub.currency ?? 'PLN').toUpperCase()} do Twojego portfela.`,
          link: '/dashboard/billing',
          subscriptionId: sub.id,
        });

        const serviceName = sub.account?.domain
          ? `${sub.plan?.name ?? 'Hosting'} (${sub.account.domain})`
          : (sub.plan?.name ?? 'Hosting Verris');
        const message = slaCreditTemplate({
          to: sub.user.email,
          firstName: sub.user.firstName,
          serviceName,
          amount: amount.toFixed(2),
          currency: (sub.currency ?? 'PLN').toUpperCase() as 'PLN' | 'EUR' | 'USD',
          downtimeMinutes: Math.round(downtimeMin),
          incidentDate: periodStart,
          newWalletBalance: new Prisma.Decimal(tx.balanceAfter).toFixed(2),
          panelUrl,
        });
        void this.mailer
          .send({ ...message, userId: sub.userId, category: 'TRANSACTIONAL', fromRole: 'BILLING' })
          .catch((err) => {
            this.logger.warn(
              `sla-credit mail failed sub=${sub.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        credited += 1;
      } catch (err) {
        // P2002 = rekompensata za ten miesiąc już istnieje (poprzedni przebieg
        // albo kredyt ręczny na wniosek). To normalny przypadek, nie błąd.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        this.logger.error(
          `SLA credit failed sub=${sub.id} period=${periodKey}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (credited > 0) {
      this.logger.log(
        `SLA credits: przyznano ${credited} rekompensat za ${periodStart.toISOString().slice(0, 7)}.`,
      );
    }
  }

  /** Przedziały niedostępności per serwer — wyłącznie incydenty MAJOR, rozwiązane. */
  private async downtimeIntervals(
    serverIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Interval[]>> {
    const incidents = await this.prisma.probeIncident.findMany({
      where: {
        status: IncidentStatus.RESOLVED,
        severity: IncidentSeverity.MAJOR,
        resolvedAt: { not: null, gt: from },
        startedAt: { lt: to },
        probe: { serverId: { in: serverIds } },
      },
      include: { probe: { select: { serverId: true } } },
    });

    const byServer = new Map<string, Interval[]>();
    for (const inc of incidents) {
      const list = byServer.get(inc.probe.serverId) ?? [];
      list.push({ start: inc.startedAt, end: inc.resolvedAt ?? inc.startedAt });
      byServer.set(inc.probe.serverId, list);
    }
    // Równoległe sondy tego samego serwera dają nakładające się incydenty —
    // bez scalenia liczylibyśmy ten sam przestój wielokrotnie.
    for (const [id, list] of byServer) byServer.set(id, mergeIntervals(list));
    return byServer;
  }

  /** Okna konserwacyjne per serwer (zapowiedziane; anulowane pomijamy). */
  private async maintenanceIntervals(
    serverIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Interval[]>> {
    const windows = await this.prisma.maintenanceWindow.findMany({
      where: {
        serverId: { in: serverIds },
        status: { in: [MaintenanceWindowStatus.COMPLETED, MaintenanceWindowStatus.IN_PROGRESS] },
        scheduledStart: { lt: to },
        scheduledEnd: { gt: from },
      },
    });

    const byServer = new Map<string, Interval[]>();
    for (const w of windows) {
      if (!w.serverId) continue;
      const list = byServer.get(w.serverId) ?? [];
      // Liczy się okno faktyczne, jeśli znane; w przeciwnym razie zapowiedziane.
      list.push({
        start: w.startedAt ?? w.scheduledStart,
        end: w.completedAt ?? w.scheduledEnd,
      });
      byServer.set(w.serverId, list);
    }
    for (const [id, list] of byServer) byServer.set(id, mergeIntervals(list));
    return byServer;
  }
}

// -----------------------------------------------------------------------------
// Arytmetyka przedziałów czasu. Wydzielona i czysta — łatwa do przetestowania.
// -----------------------------------------------------------------------------

export interface Interval {
  start: Date;
  end: Date;
}

/** Pierwszy i ostatni moment poprzedniego miesiąca kalendarzowego (UTC). */
export function previousMonthUtc(now: Date): { periodStart: Date; periodEnd: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    periodStart: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
  };
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 60000);
}

/** Scala nakładające się i stykające przedziały. */
export function mergeIntervals(list: Interval[]): Interval[] {
  if (list.length <= 1) return [...list];
  const sorted = [...list].sort((x, y) => x.start.getTime() - y.start.getTime());
  const out: Interval[] = [{ ...sorted[0] }];
  for (const cur of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Przycina przedziały do okna [from, to) i odrzuca puste. */
export function clipIntervals(list: Interval[], from: Date, to: Date): Interval[] {
  const out: Interval[] = [];
  for (const iv of list) {
    const start = iv.start < from ? from : iv.start;
    const end = iv.end > to ? to : iv.end;
    if (end.getTime() > start.getTime()) out.push({ start, end });
  }
  return out;
}

/** Część wspólna dwóch zbiorów rozłącznych, posortowanych przedziałów. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start.getTime(), b[j].start.getTime());
    const end = Math.min(a[i].end.getTime(), b[j].end.getTime());
    if (end > start) out.push({ start: new Date(start), end: new Date(end) });
    if (a[i].end.getTime() < b[j].end.getTime()) i += 1;
    else j += 1;
  }
  return out;
}

export function totalMinutes(list: Interval[]): number {
  return list.reduce((acc, iv) => acc + minutesBetween(iv.start, iv.end), 0);
}

/**
 * Tabela progów z §15 ust. 2. Wejście w punktach bazowych (9950 = 99,50%).
 * Granice są domknięte od dołu: „od 99,0% do poniżej 99,5%" → [9900, 9950).
 */
export function tierPercent(availabilityBp: number): 0 | 5 | 25 | 50 | 100 {
  if (availabilityBp >= 9950) return 0;
  if (availabilityBp >= 9900) return 5;
  if (availabilityBp >= 9500) return 25;
  if (availabilityBp >= 9000) return 50;
  return 100;
}
