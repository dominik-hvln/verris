import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingSegment,
  Prisma,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import type { MailMessage } from '../mail/mailer.interface';
import { renderEmailShell } from '../mail/templates/_layouts/email-shell';
import { AuditService } from '../common/audit/audit.service';

/**
 * Sprint 2.6 — silnik kampanii marketingowych.
 *
 * Po stronie biznesowej:
 *   1. Admin tworzy kampanię (DRAFT) z subject + body w panelu.
 *   2. Po zatwierdzeniu kampania przechodzi w SCHEDULED (od razu lub na
 *      konkretną datę). Tylko jedna kampania w stanie SENDING jednocześnie —
 *      nie chcemy zatkać Postfixa równolegle.
 *   3. Worker (`sendNextBatch`) iteruje po segmencie z paginacją po 100
 *      odbiorców, dla każdego wstawia EmailLog i woła MailerService.send.
 *      Idempotencja: jeśli EmailLog dla `(campaignId, userId)` już istnieje
 *      (po crashu), pomijamy go.
 *
 * Kampanie używają `category=MARKETING` w MailerService — automatycznie
 * respektują opt-out i dostają header List-Unsubscribe.
 */
@Injectable()
export class MarketingCampaignService {
  private readonly logger = new Logger(MarketingCampaignService.name);
  private static readonly BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(input: {
    name: string;
    description?: string | null;
    subject: string;
    bodyMarkdown: string;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    segment: MarketingSegment;
    scheduledAt?: Date | null;
    actorUserId: string;
  }): Promise<MarketingCampaign> {
    if (!input.name?.trim()) throw new BadRequestException('Nazwa wymagana.');
    if (!input.subject?.trim()) throw new BadRequestException('Subject wymagany.');
    if (!input.bodyMarkdown?.trim()) throw new BadRequestException('Treść wymagana.');
    if ((input.ctaLabel && !input.ctaUrl) || (!input.ctaLabel && input.ctaUrl)) {
      throw new BadRequestException('CTA wymaga zarówno etykiety jak i URLa.');
    }

    const status: MarketingCampaignStatus = input.scheduledAt
      ? MarketingCampaignStatus.SCHEDULED
      : MarketingCampaignStatus.DRAFT;

    const created = await this.prisma.marketingCampaign.create({
      data: {
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 500) || null,
        subject: input.subject.trim().slice(0, 255),
        bodyMarkdown: input.bodyMarkdown,
        ctaLabel: input.ctaLabel?.trim().slice(0, 80) || null,
        ctaUrl: input.ctaUrl?.trim().slice(0, 500) || null,
        segment: input.segment,
        scheduledAt: input.scheduledAt ?? null,
        status,
        createdById: input.actorUserId,
      },
    });

    await this.audit.record({
      action: 'MARKETING_CAMPAIGN_CREATED',
      actorUserId: input.actorUserId,
      details: { campaignId: created.id, status, segment: input.segment },
    });
    return created;
  }

  async list(filter?: { status?: MarketingCampaignStatus }): Promise<MarketingCampaign[]> {
    return this.prisma.marketingCampaign.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string): Promise<MarketingCampaign> {
    const c = await this.prisma.marketingCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Kampania nie istnieje.');
    return c;
  }

  /**
   * Schedule kampanii w stanie DRAFT — natychmiast albo na konkretną datę
   * (worker pobierze ją z `MarketingCampaignDispatcher` schedule'ra).
   */
  async schedule(
    id: string,
    opts: { scheduledAt?: Date | null; actorUserId: string },
  ): Promise<MarketingCampaign> {
    const c = await this.get(id);
    if (c.status !== MarketingCampaignStatus.DRAFT) {
      throw new ConflictException(`Kampania w stanie ${c.status} nie może być zaplanowana.`);
    }
    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      data: {
        status: MarketingCampaignStatus.SCHEDULED,
        scheduledAt: opts.scheduledAt ?? new Date(),
      },
    });
    await this.audit.record({
      action: 'MARKETING_CAMPAIGN_SCHEDULED',
      actorUserId: opts.actorUserId,
      details: { campaignId: id, scheduledAt: updated.scheduledAt?.toISOString() ?? null },
    });
    return updated;
  }

  async cancel(id: string, actorUserId: string): Promise<MarketingCampaign> {
    const c = await this.get(id);
    if (c.status === MarketingCampaignStatus.SENT || c.status === MarketingCampaignStatus.SENDING) {
      throw new ConflictException(`Nie można anulować kampanii w stanie ${c.status}.`);
    }
    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      data: { status: MarketingCampaignStatus.CANCELED },
    });
    await this.audit.record({
      action: 'MARKETING_CAMPAIGN_CANCELED',
      actorUserId,
      details: { campaignId: id },
    });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Worker / dispatcher entry point
  // ---------------------------------------------------------------------------

  /**
   * Bierze JEDNĄ paczkę odbiorców (`BATCH_SIZE`) i wysyła im maile, aktualizując
   * statystyki kampanii. Designed do wywołania z cron-a co minutę — nie
   * zarządza scheduling-iem (to robi `MarketingCampaignDispatcher`).
   *
   * Idempotentny: gdy worker padnie w środku batcha, ponowne wywołanie
   * pomija odbiorców którzy mają już EmailLog dla tej kampanii.
   */
  async sendNextBatch(campaignId: string): Promise<{ done: boolean; processed: number }> {
    const campaign = await this.get(campaignId);
    if (campaign.status !== MarketingCampaignStatus.SENDING) {
      throw new ConflictException(
        `Kampania w stanie ${campaign.status} — nie wysyłamy. Użyj startSending() najpierw.`,
      );
    }

    const recipients = await this.fetchSegmentBatch(
      campaign.segment,
      campaign.cursorOffset,
      MarketingCampaignService.BATCH_SIZE,
    );
    if (recipients.length === 0) {
      // Brak więcej — flag SENT.
      await this.prisma.marketingCampaign.update({
        where: { id: campaignId },
        data: {
          status: MarketingCampaignStatus.SENT,
          completedAt: new Date(),
        },
      });
      this.logger.log(`Campaign ${campaignId} completed.`);
      return { done: true, processed: 0 };
    }

    let sent = 0;
    let suppressed = 0;
    let failed = 0;

    for (const r of recipients) {
      // Idempotencja — jeśli już mamy log dla pary (campaignId, userId), pomijamy.
      const existing = await this.prisma.emailLog.findFirst({
        where: { campaignId, userId: r.id },
        select: { id: true },
      });
      if (existing) continue;

      const message = this.buildCampaignMessage(campaign, {
        userId: r.id,
        email: r.email,
      });
      const result = await this.mailer.send(message);
      if (result.delivered) sent++;
      else if (result.suppressedReason) suppressed++;
      else failed++;
    }

    await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        cursorOffset: campaign.cursorOffset + recipients.length,
        sentCount: { increment: sent },
        suppressedCount: { increment: suppressed },
        failedCount: { increment: failed },
      },
    });

    return { done: false, processed: recipients.length };
  }

  /**
   * Worker entry — przeprowadza kampanię SCHEDULED do SENDING (jednorazowo
   * przy pierwszym batchu) i ustawia `recipientCount` na podstawie segmentu.
   * Wywołać raz przed pierwszym `sendNextBatch`.
   */
  async startSending(campaignId: string): Promise<MarketingCampaign> {
    const c = await this.get(campaignId);
    if (c.status !== MarketingCampaignStatus.SCHEDULED) {
      throw new ConflictException(`Kampania w stanie ${c.status} — nie startujemy.`);
    }
    const recipientCount = await this.countSegment(c.segment);
    return this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: MarketingCampaignStatus.SENDING,
        startedAt: new Date(),
        recipientCount,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Segment resolution
  // ---------------------------------------------------------------------------

  private async fetchSegmentBatch(
    segment: MarketingSegment,
    skip: number,
    take: number,
  ): Promise<Array<{ id: string; email: string }>> {
    const where = this.buildSegmentWhere(segment);
    return this.prisma.user.findMany({
      where,
      orderBy: { id: 'asc' },
      skip,
      take,
      select: { id: true, email: true },
    });
  }

  private async countSegment(segment: MarketingSegment): Promise<number> {
    const where = this.buildSegmentWhere(segment);
    return this.prisma.user.count({ where });
  }

  /** Podgląd wielkości listy odbiorców dla segmentu (przed wysyłką). */
  async estimateRecipients(segment: MarketingSegment): Promise<number> {
    return this.countSegment(segment);
  }

  private buildSegmentWhere(segment: MarketingSegment): Prisma.UserWhereInput {
    const baseAlive: Prisma.UserWhereInput = {
      anonymizedAt: null,
      deletionRequestedAt: null,
    };
    switch (segment) {
      case MarketingSegment.NEWSLETTER_OPT_IN:
        return {
          ...baseAlive,
          marketingPreferences: { is: { marketingEmail: true } },
        };
      case MarketingSegment.PRODUCT_UPDATES_OPT_IN:
        return {
          ...baseAlive,
          marketingPreferences: { is: { productUpdatesEmail: true } },
        };
      case MarketingSegment.ALL_ACTIVE_USERS:
        return baseAlive;
      default: {
        const _exhaustive: never = segment;
        return _exhaustive;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Message build
  // ---------------------------------------------------------------------------

  private buildCampaignMessage(
    campaign: MarketingCampaign,
    recipient: { userId: string; email: string },
  ): MailMessage {
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const cta =
      campaign.ctaLabel && campaign.ctaUrl
        ? { label: campaign.ctaLabel, url: campaign.ctaUrl }
        : undefined;
    const { html, text } = renderEmailShell({
      title: campaign.subject,
      bodyMarkdown: campaign.bodyMarkdown,
      cta,
      footnote:
        'To wiadomość marketingowa wysłana w ramach Twojej zgody na newsletter Verris. Możesz wypisać się jednym kliknięciem (link „Wypisz" niżej).',
      recipientEmail: recipient.email,
      panelUrl,
      category: 'MARKETING',
    });

    return {
      to: recipient.email,
      tag: `marketing.campaign.${campaign.id.slice(0, 8)}`,
      subject: campaign.subject,
      text,
      html,
      category: 'MARKETING',
      userId: recipient.userId,
      campaignId: campaign.id,
    };
  }
}
