import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { OutboundAbuseGuard } from '../deliverability/outbound-abuse.guard';
import { renderEmailShell } from '../mail/templates/_layouts/email-shell';
import type {
  AddEmmContactDto,
  CreateEmmCampaignDto,
  CreateEmmListDto,
  ImportEmmContactsDto,
  UpdateEmmCampaignDto,
  UpdateEmmListDto,
} from './dto/email-marketing.dto';

// ---------------------------------------------------------------------------
// Minimalne delegate'y Prisma — klient regenerowany w buildzie prod
// (Dockerfile.api). W sandboxie nowe modele EMM jeszcze nie istnieją w typach.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
interface Delegate {
  findUnique(a: Row): Promise<any>;
  findFirst(a: Row): Promise<any>;
  findMany(a: Row): Promise<any[]>;
  create(a: Row): Promise<any>;
  update(a: Row): Promise<any>;
  updateMany(a: Row): Promise<{ count: number }>;
  delete(a: Row): Promise<any>;
  count(a: Row): Promise<number>;
}

export interface EmmListView {
  id: string;
  name: string;
  description: string | null;
  doubleOptIn: boolean;
  fromName: string | null;
  replyTo: string | null;
  subscribed: number;
  pending: number;
  unsubscribed: number;
  createdAt: string;
}

export interface EmmContactView {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  source: string | null;
  createdAt: string;
}

export interface EmmCampaignView {
  id: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  listId: string;
  listName: string | null;
  status: string;
  scheduledAt: string | null;
  recipientCount: number;
  sentCount: number;
  suppressedCount: number;
  failedCount: number;
  createdAt: string;
}

export interface EmmOverview {
  subscriptionId: string;
  limits: { maxContacts: number | null; monthlySends: number | null };
  usage: { contacts: number; sentThisMonth: number };
  lists: number;
  campaigns: number;
}

@Injectable()
export class EmailMarketingService {
  private readonly logger = new Logger(EmailMarketingService.name);
  private static readonly BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly outbound: OutboundAbuseGuard,
  ) {}

  private get lists(): Delegate {
    return (this.prisma as unknown as { emmList: Delegate }).emmList;
  }
  private get contacts(): Delegate {
    return (this.prisma as unknown as { emmContact: Delegate }).emmContact;
  }
  private get campaigns(): Delegate {
    return (this.prisma as unknown as { emmCampaign: Delegate }).emmCampaign;
  }
  private get sends(): Delegate {
    return (this.prisma as unknown as { emmSend: Delegate }).emmSend;
  }

  // -------------------------------------------------------------------------
  // Ownership / scoping
  // -------------------------------------------------------------------------

  /**
   * Weryfikuje, że subskrypcja należy do użytkownika, jest aktywna i jest
   * produktem email-marketingu. Zwraca limity planu. Każda operacja klienta
   * przechodzi przez ten gate (account-scoped) — bez tego ForbiddenException.
   */
  async resolveWorkspace(
    userId: string,
    subscriptionId: string,
  ): Promise<{ subscriptionId: string; userId: string; maxContacts: number | null; monthlySends: number | null }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub || sub.userId !== userId) {
      throw new NotFoundException('Usługa nie istnieje.');
    }
    if ((sub.plan.productKind as string) !== 'EMAIL_MARKETING') {
      throw new BadRequestException('Ta usługa nie jest produktem email-marketingu.');
    }
    if (sub.status !== 'ACTIVE') {
      throw new ForbiddenException('Usługa email-marketingu nie jest aktywna.');
    }
    const plan = sub.plan as unknown as { emmMaxContacts: number | null; emmMonthlySends: number | null };
    return {
      subscriptionId,
      userId,
      maxContacts: plan.emmMaxContacts ?? null,
      monthlySends: plan.emmMonthlySends ?? null,
    };
  }

  private async ownedList(userId: string, subscriptionId: string, listId: string): Promise<any> {
    const list = await this.lists.findUnique({ where: { id: listId } });
    if (!list || list.subscriptionId !== subscriptionId || list.userId !== userId) {
      throw new NotFoundException('Lista nie istnieje.');
    }
    return list;
  }

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  async overview(userId: string, subscriptionId: string): Promise<EmmOverview> {
    const ws = await this.resolveWorkspace(userId, subscriptionId);
    const [contacts, lists, campaigns, sentThisMonth] = await Promise.all([
      this.contacts.count({
        where: { list: { subscriptionId }, status: { in: ['SUBSCRIBED', 'PENDING'] } },
      }),
      this.lists.count({ where: { subscriptionId } }),
      this.campaigns.count({ where: { subscriptionId } }),
      this.sentThisMonth(subscriptionId),
    ]);
    return {
      subscriptionId,
      limits: { maxContacts: ws.maxContacts, monthlySends: ws.monthlySends },
      usage: { contacts, sentThisMonth },
      lists,
      campaigns,
    };
  }

  private monthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private async sentThisMonth(subscriptionId: string): Promise<number> {
    return this.sends.count({
      where: {
        status: 'SENT',
        createdAt: { gte: this.monthStart() },
        campaign: { subscriptionId },
      },
    });
  }

  private async activeContactCount(subscriptionId: string): Promise<number> {
    return this.contacts.count({
      where: { list: { subscriptionId }, status: { in: ['SUBSCRIBED', 'PENDING'] } },
    });
  }

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  async createList(userId: string, subscriptionId: string, dto: CreateEmmListDto): Promise<EmmListView> {
    await this.resolveWorkspace(userId, subscriptionId);
    const row = await this.lists.create({
      data: {
        subscriptionId,
        userId,
        name: dto.name.trim().slice(0, 120),
        description: dto.description?.trim().slice(0, 500) || null,
        doubleOptIn: dto.doubleOptIn ?? true,
        fromName: dto.fromName?.trim().slice(0, 120) || null,
        replyTo: dto.replyTo?.trim() || null,
      },
    });
    await this.audit.record({
      action: 'EMM_LIST_CREATED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, listId: row.id },
    });
    return this.listView(row, { subscribed: 0, pending: 0, unsubscribed: 0 });
  }

  async updateList(userId: string, subscriptionId: string, listId: string, dto: UpdateEmmListDto): Promise<EmmListView> {
    await this.resolveWorkspace(userId, subscriptionId);
    await this.ownedList(userId, subscriptionId, listId);
    const data: Row = {};
    if (dto.name !== undefined) data.name = dto.name.trim().slice(0, 120);
    if (dto.description !== undefined) data.description = dto.description?.trim().slice(0, 500) || null;
    if (dto.doubleOptIn !== undefined) data.doubleOptIn = dto.doubleOptIn;
    if (dto.fromName !== undefined) data.fromName = dto.fromName?.trim().slice(0, 120) || null;
    if (dto.replyTo !== undefined) data.replyTo = dto.replyTo?.trim() || null;
    const row = await this.lists.update({ where: { id: listId }, data });
    const counts = await this.listCounts(listId);
    return this.listView(row, counts);
  }

  async deleteList(userId: string, subscriptionId: string, listId: string): Promise<{ ok: true }> {
    await this.resolveWorkspace(userId, subscriptionId);
    await this.ownedList(userId, subscriptionId, listId);
    await this.lists.delete({ where: { id: listId } });
    await this.audit.record({
      action: 'EMM_LIST_DELETED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, listId },
    });
    return { ok: true };
  }

  async listLists(userId: string, subscriptionId: string): Promise<EmmListView[]> {
    await this.resolveWorkspace(userId, subscriptionId);
    const rows = await this.lists.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
    });
    const out: EmmListView[] = [];
    for (const r of rows) {
      out.push(this.listView(r, await this.listCounts(r.id)));
    }
    return out;
  }

  private async listCounts(listId: string): Promise<{ subscribed: number; pending: number; unsubscribed: number }> {
    const [subscribed, pending, unsubscribed] = await Promise.all([
      this.contacts.count({ where: { listId, status: 'SUBSCRIBED' } }),
      this.contacts.count({ where: { listId, status: 'PENDING' } }),
      this.contacts.count({ where: { listId, status: 'UNSUBSCRIBED' } }),
    ]);
    return { subscribed, pending, unsubscribed };
  }

  private listView(r: any, c: { subscribed: number; pending: number; unsubscribed: number }): EmmListView {
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      doubleOptIn: r.doubleOptIn,
      fromName: r.fromName ?? null,
      replyTo: r.replyTo ?? null,
      subscribed: c.subscribed,
      pending: c.pending,
      unsubscribed: c.unsubscribed,
      createdAt: (r.createdAt as Date).toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------

  async listContacts(
    userId: string,
    subscriptionId: string,
    listId: string,
    opts: { take?: number; skip?: number } = {},
  ): Promise<EmmContactView[]> {
    await this.resolveWorkspace(userId, subscriptionId);
    await this.ownedList(userId, subscriptionId, listId);
    const rows = await this.contacts.findMany({
      where: { listId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.take ?? 200, 500),
      skip: opts.skip ?? 0,
    });
    return rows.map((r) => this.contactView(r));
  }

  async addContact(
    userId: string,
    subscriptionId: string,
    listId: string,
    dto: AddEmmContactDto,
  ): Promise<EmmContactView> {
    const ws = await this.resolveWorkspace(userId, subscriptionId);
    const list = await this.ownedList(userId, subscriptionId, listId);
    await this.assertContactCapacity(ws, 1);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.contacts.findFirst({ where: { listId, email } });
    if (existing) throw new ConflictException('Kontakt z tym adresem już istnieje na liście.');

    const doubleOptIn = list.doubleOptIn !== false;
    const row = await this.contacts.create({
      data: {
        listId,
        email,
        firstName: dto.firstName?.trim().slice(0, 80) || null,
        lastName: dto.lastName?.trim().slice(0, 80) || null,
        status: doubleOptIn ? 'PENDING' : 'SUBSCRIBED',
        confirmToken: doubleOptIn ? this.token('cf') : null,
        confirmedAt: doubleOptIn ? null : new Date(),
        unsubToken: this.token('un'),
        source: 'manual',
      },
    });
    if (doubleOptIn) {
      await this.sendConfirmationEmail(list, row).catch((e) =>
        this.logger.warn(`Confirmation email failed for ${email}: ${(e as Error).message}`),
      );
    }
    await this.audit.record({
      action: 'EMM_CONTACT_ADDED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, listId, contactId: row.id, doubleOptIn },
    });
    return this.contactView(row);
  }

  async importContacts(
    userId: string,
    subscriptionId: string,
    listId: string,
    dto: ImportEmmContactsDto,
  ): Promise<{ added: number; skipped: number; total: number }> {
    const ws = await this.resolveWorkspace(userId, subscriptionId);
    const list = await this.ownedList(userId, subscriptionId, listId);
    if (!dto.consentConfirmed) {
      throw new BadRequestException('Wymagane potwierdzenie podstawy prawnej (zgody) kontaktów.');
    }
    if (!dto.rows?.length) throw new BadRequestException('Brak wierszy do importu.');
    if (dto.rows.length > 5000) throw new BadRequestException('Maksymalnie 5000 kontaktów na import.');

    // Dedup w obrębie pliku + względem listy.
    const seen = new Set<string>();
    const incoming = dto.rows
      .map((r) => ({ ...r, email: r.email.trim().toLowerCase() }))
      .filter((r) => {
        if (seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
      });

    await this.assertContactCapacity(ws, incoming.length);

    const doubleOptIn = list.doubleOptIn !== false;
    let added = 0;
    let skipped = 0;
    for (const r of incoming) {
      const existing = await this.contacts.findFirst({ where: { listId, email: r.email } });
      if (existing) {
        skipped++;
        continue;
      }
      const contact = await this.contacts.create({
        data: {
          listId,
          email: r.email,
          firstName: r.firstName?.trim().slice(0, 80) || null,
          lastName: r.lastName?.trim().slice(0, 80) || null,
          status: doubleOptIn ? 'PENDING' : 'SUBSCRIBED',
          confirmToken: doubleOptIn ? this.token('cf') : null,
          confirmedAt: doubleOptIn ? null : new Date(),
          unsubToken: this.token('un'),
          source: 'import',
        },
      });
      added++;
      if (doubleOptIn) {
        await this.sendConfirmationEmail(list, contact).catch(() => undefined);
      }
    }
    await this.audit.record({
      action: 'EMM_CONTACTS_IMPORTED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, listId, added, skipped, consentConfirmed: true },
    });
    return { added, skipped, total: incoming.length };
  }

  async deleteContact(userId: string, subscriptionId: string, listId: string, contactId: string): Promise<{ ok: true }> {
    await this.resolveWorkspace(userId, subscriptionId);
    await this.ownedList(userId, subscriptionId, listId);
    const contact = await this.contacts.findUnique({ where: { id: contactId } });
    if (!contact || contact.listId !== listId) throw new NotFoundException('Kontakt nie istnieje.');
    await this.contacts.delete({ where: { id: contactId } });
    return { ok: true };
  }

  private async assertContactCapacity(
    ws: { subscriptionId: string; maxContacts: number | null },
    incoming: number,
  ): Promise<void> {
    if (ws.maxContacts === null) return;
    const current = await this.activeContactCount(ws.subscriptionId);
    if (current + incoming > ws.maxContacts) {
      throw new ForbiddenException(
        `Limit kontaktów planu (${ws.maxContacts}) zostałby przekroczony. Aktualnie: ${current}.`,
      );
    }
  }

  private contactView(r: any): EmmContactView {
    return {
      id: r.id,
      email: r.email,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      status: r.status,
      source: r.source ?? null,
      createdAt: (r.createdAt as Date).toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------

  async listCampaigns(userId: string, subscriptionId: string): Promise<EmmCampaignView[]> {
    await this.resolveWorkspace(userId, subscriptionId);
    const rows = await this.campaigns.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      include: { list: { select: { name: true } } },
    });
    return rows.map((r) => this.campaignView(r));
  }

  async createCampaign(userId: string, subscriptionId: string, dto: CreateEmmCampaignDto): Promise<EmmCampaignView> {
    await this.resolveWorkspace(userId, subscriptionId);
    await this.ownedList(userId, subscriptionId, dto.listId);
    if ((dto.ctaLabel && !dto.ctaUrl) || (!dto.ctaLabel && dto.ctaUrl)) {
      throw new BadRequestException('CTA wymaga zarówno etykiety jak i adresu URL.');
    }
    const row = await this.campaigns.create({
      data: {
        subscriptionId,
        userId,
        listId: dto.listId,
        name: dto.name.trim().slice(0, 120),
        subject: dto.subject.trim().slice(0, 200),
        bodyMarkdown: dto.bodyMarkdown,
        ctaLabel: dto.ctaLabel?.trim().slice(0, 80) || null,
        ctaUrl: dto.ctaUrl?.trim().slice(0, 500) || null,
        status: 'DRAFT',
      },
      include: { list: { select: { name: true } } },
    });
    await this.audit.record({
      action: 'EMM_CAMPAIGN_CREATED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, campaignId: row.id },
    });
    return this.campaignView(row);
  }

  async updateCampaign(
    userId: string,
    subscriptionId: string,
    campaignId: string,
    dto: UpdateEmmCampaignDto,
  ): Promise<EmmCampaignView> {
    await this.resolveWorkspace(userId, subscriptionId);
    const c = await this.ownedCampaign(subscriptionId, campaignId);
    if (c.status !== 'DRAFT') throw new ConflictException('Edytować można tylko kampanię w stanie roboczym (DRAFT).');
    const data: Row = {};
    if (dto.name !== undefined) data.name = dto.name.trim().slice(0, 120);
    if (dto.subject !== undefined) data.subject = dto.subject.trim().slice(0, 200);
    if (dto.bodyMarkdown !== undefined) data.bodyMarkdown = dto.bodyMarkdown;
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel?.trim().slice(0, 80) || null;
    if (dto.ctaUrl !== undefined) data.ctaUrl = dto.ctaUrl?.trim().slice(0, 500) || null;
    const row = await this.campaigns.update({
      where: { id: campaignId },
      data,
      include: { list: { select: { name: true } } },
    });
    return this.campaignView(row);
  }

  async deleteCampaign(userId: string, subscriptionId: string, campaignId: string): Promise<{ ok: true }> {
    await this.resolveWorkspace(userId, subscriptionId);
    const c = await this.ownedCampaign(subscriptionId, campaignId);
    if (c.status === 'SENDING') throw new ConflictException('Nie można usunąć kampanii w trakcie wysyłki.');
    await this.campaigns.delete({ where: { id: campaignId } });
    return { ok: true };
  }

  /**
   * Wysyłka kampanii: walidacja limitu miesięcznego względem liczby aktywnych
   * (SUBSCRIBED) odbiorców listy, następnie przejście DRAFT → SENDING. Dalszą
   * pracę wykonuje dispatcher (batchami, idempotentnie).
   */
  async sendCampaign(userId: string, subscriptionId: string, campaignId: string): Promise<EmmCampaignView> {
    // CYBER-3 — nie pozwól wystartować kampanii z konta w cordonie (outbound spam).
    await this.outbound.assertNotCordoned(userId);
    const ws = await this.resolveWorkspace(userId, subscriptionId);
    const c = await this.ownedCampaign(subscriptionId, campaignId);
    if (c.status !== 'DRAFT') throw new ConflictException(`Kampania w stanie ${c.status} nie może być wysłana.`);

    const recipientCount = await this.contacts.count({ where: { listId: c.listId, status: 'SUBSCRIBED' } });
    if (recipientCount === 0) {
      throw new BadRequestException('Lista nie ma potwierdzonych (SUBSCRIBED) odbiorców.');
    }
    if (ws.monthlySends !== null) {
      const used = await this.sentThisMonth(subscriptionId);
      if (used + recipientCount > ws.monthlySends) {
        throw new ForbiddenException(
          `Miesięczny limit wysyłek planu (${ws.monthlySends}) zostałby przekroczony. Wysłano w tym miesiącu: ${used}, kampania: ${recipientCount}.`,
        );
      }
    }

    const row = await this.campaigns.update({
      where: { id: campaignId },
      data: { status: 'SENDING', startedAt: new Date(), recipientCount, cursorOffset: 0 },
      include: { list: { select: { name: true } } },
    });
    await this.audit.record({
      action: 'EMM_CAMPAIGN_SENT',
      userId,
      actorUserId: userId,
      details: { subscriptionId, campaignId, recipientCount },
    });
    return this.campaignView(row);
  }

  private async ownedCampaign(subscriptionId: string, campaignId: string): Promise<any> {
    const c = await this.campaigns.findUnique({ where: { id: campaignId } });
    if (!c || c.subscriptionId !== subscriptionId) throw new NotFoundException('Kampania nie istnieje.');
    return c;
  }

  private campaignView(r: any): EmmCampaignView {
    return {
      id: r.id,
      name: r.name,
      subject: r.subject,
      bodyMarkdown: r.bodyMarkdown,
      ctaLabel: r.ctaLabel ?? null,
      ctaUrl: r.ctaUrl ?? null,
      listId: r.listId,
      listName: r.list?.name ?? null,
      status: r.status,
      scheduledAt: r.scheduledAt ? (r.scheduledAt as Date).toISOString() : null,
      recipientCount: r.recipientCount ?? 0,
      sentCount: r.sentCount ?? 0,
      suppressedCount: r.suppressedCount ?? 0,
      failedCount: r.failedCount ?? 0,
      createdAt: (r.createdAt as Date).toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Send engine (called by dispatcher)
  // -------------------------------------------------------------------------

  /** Lista kampanii w stanie SENDING (dla dispatcher-a). */
  async findSending(limit = 20): Promise<Array<{ id: string }>> {
    return this.campaigns.findMany({
      where: { status: 'SENDING' },
      orderBy: { startedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  /**
   * Wyślij JEDNĄ paczkę odbiorców kampanii. Idempotentnie: pomijamy kontakty,
   * które już mają EmmSend dla tej kampanii (unikat campaignId+contactId).
   * Zwraca done=true gdy nie ma więcej odbiorców (kampania → SENT).
   */
  async sendNextBatch(campaignId: string): Promise<{ done: boolean; processed: number }> {
    const campaign = await this.campaigns.findUnique({
      where: { id: campaignId },
      include: { list: true },
    });
    if (!campaign || campaign.status !== 'SENDING') return { done: true, processed: 0 };

    // CYBER-3 — jeśli konto właściciela jest w cordonie, wstrzymaj wysyłkę.
    // Kampania zostaje SENDING; wznowi się automatycznie po zwolnieniu cordonu.
    if (await this.outbound.isCordoned(campaign.userId)) {
      this.logger.warn(
        `EMM campaign ${campaignId} wstrzymana — konto ${campaign.userId} w cordonie (outbound).`,
      );
      return { done: true, processed: 0 };
    }

    const recipients = await this.contacts.findMany({
      where: { listId: campaign.listId, status: 'SUBSCRIBED' },
      orderBy: { id: 'asc' },
      skip: campaign.cursorOffset ?? 0,
      take: EmailMarketingService.BATCH_SIZE,
    });

    if (recipients.length === 0) {
      await this.campaigns.update({
        where: { id: campaignId },
        data: { status: 'SENT', completedAt: new Date() },
      });
      this.logger.log(`EMM campaign ${campaignId} completed.`);
      return { done: true, processed: 0 };
    }

    let sent = 0;
    let suppressed = 0;
    let failed = 0;

    for (const contact of recipients) {
      const existing = await this.sends.findFirst({
        where: { campaignId, contactId: contact.id },
        select: { id: true },
      });
      if (existing) continue;

      let status: 'SENT' | 'SUPPRESSED' | 'FAILED' = 'SENT';
      let reason: string | null = null;
      try {
        const result = await this.deliver(campaign, campaign.list, contact);
        if (result.delivered) {
          status = 'SENT';
          sent++;
        } else {
          status = 'SUPPRESSED';
          reason = result.suppressedReason ?? 'SUPPRESSED';
          suppressed++;
        }
      } catch (err) {
        status = 'FAILED';
        reason = (err as Error).message.slice(0, 200);
        failed++;
      }
      await this.sends.create({ data: { campaignId, contactId: contact.id, status, reason } });
    }

    await this.campaigns.update({
      where: { id: campaignId },
      data: {
        cursorOffset: (campaign.cursorOffset ?? 0) + recipients.length,
        sentCount: { increment: sent },
        suppressedCount: { increment: suppressed },
        failedCount: { increment: failed },
      },
    });

    // CYBER-3 — zlicz realnie wysłane wiadomości do limitów per konto. Gdy
    // przekroczą próg (skok/godzina/doba), guard nakłada cordon i rzuca —
    // przechwytujemy, by zatrzymać kampanię bez wywracania dispatchera.
    if (sent > 0) {
      try {
        await this.outbound.recordSends(campaign.userId, sent, {
          subscriptionId: campaign.subscriptionId,
          source: 'emm',
        });
      } catch {
        return { done: true, processed: recipients.length };
      }
    }
    return { done: false, processed: recipients.length };
  }

  private async deliver(campaign: any, list: any, contact: any): Promise<{ delivered: boolean; suppressedReason?: string }> {
    const unsubUrl = this.unsubscribeUrl(contact.unsubToken);
    const greeting = contact.firstName ? `Cześć ${contact.firstName},\n\n` : '';
    const { html, text } = renderEmailShell({
      title: campaign.subject,
      bodyMarkdown: greeting + campaign.bodyMarkdown,
      cta: campaign.ctaLabel && campaign.ctaUrl ? { label: campaign.ctaLabel, url: campaign.ctaUrl } : undefined,
      footnote: `Otrzymujesz tę wiadomość, bo zapisałeś/aś się na listę „${list.name}". Możesz wypisać się jednym kliknięciem.`,
      recipientEmail: contact.email,
      panelUrl: this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl',
      category: 'MARKETING',
    });

    const result = await this.mailer.send({
      to: contact.email,
      subject: campaign.subject,
      text,
      html,
      category: 'MARKETING',
      externalRecipient: true,
      listUnsubscribeUrl: unsubUrl,
      fromName: list.fromName || undefined,
      replyTo: list.replyTo || undefined,
      tag: `emm.campaign.${String(campaign.id).slice(0, 8)}`,
    });
    return { delivered: result.delivered, suppressedReason: result.suppressedReason };
  }

  // -------------------------------------------------------------------------
  // Public — double opt-in confirm + unsubscribe (no auth)
  // -------------------------------------------------------------------------

  async confirmByToken(token: string): Promise<{ ok: boolean; listName: string | null }> {
    const contact = await this.contacts.findUnique({ where: { confirmToken: token } });
    if (!contact) return { ok: false, listName: null };
    if (contact.status === 'SUBSCRIBED') {
      const list = await this.lists.findUnique({ where: { id: contact.listId } });
      return { ok: true, listName: list?.name ?? null };
    }
    await this.contacts.update({
      where: { id: contact.id },
      data: { status: 'SUBSCRIBED', confirmedAt: new Date(), confirmToken: null },
    });
    const list = await this.lists.findUnique({ where: { id: contact.listId } });
    return { ok: true, listName: list?.name ?? null };
  }

  async unsubscribeByToken(token: string): Promise<{ ok: boolean; listName: string | null }> {
    const contact = await this.contacts.findUnique({ where: { unsubToken: token } });
    if (!contact) return { ok: false, listName: null };
    if (contact.status !== 'UNSUBSCRIBED') {
      await this.contacts.update({
        where: { id: contact.id },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      });
    }
    const list = await this.lists.findUnique({ where: { id: contact.listId } });
    return { ok: true, listName: list?.name ?? null };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private token(prefix: string): string {
    return `${prefix}_${randomBytes(24).toString('hex')}`;
  }

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl'
    );
  }

  private unsubscribeUrl(token: string): string {
    return `${this.apiBaseUrl()}/emm/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  private confirmUrl(token: string): string {
    return `${this.apiBaseUrl()}/emm/confirm?token=${encodeURIComponent(token)}`;
  }

  private async sendConfirmationEmail(list: any, contact: any): Promise<void> {
    if (!contact.confirmToken) return;
    const { html, text } = renderEmailShell({
      title: 'Potwierdź zapis na listę',
      bodyMarkdown:
        `Aby zakończyć zapis na listę **${list.name}**, potwierdź swój adres e-mail klikając przycisk poniżej.\n\n` +
        'Jeśli to nie Ty zapisywałeś/aś się na tę listę, zignoruj tę wiadomość — bez potwierdzenia nie wyślemy Ci żadnych innych e-maili.',
      cta: { label: 'Potwierdzam zapis', url: this.confirmUrl(contact.confirmToken) },
      footnote: 'Link potwierdzający jest jednorazowy.',
      recipientEmail: contact.email,
      panelUrl: this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl',
      category: 'TRANSACTIONAL',
    });
    await this.mailer.send({
      to: contact.email,
      subject: `Potwierdź zapis na listę „${list.name}"`,
      text,
      html,
      category: 'TRANSACTIONAL',
      externalRecipient: true,
      fromName: list.fromName || undefined,
      replyTo: list.replyTo || undefined,
      tag: 'emm.confirm',
    });
  }
}
