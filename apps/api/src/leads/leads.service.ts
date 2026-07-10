import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiteLeadKind, SiteLeadStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import {
  leadContactAckTemplate,
  leadNotifyTemplate,
  leadOptInTemplate,
} from './leads.templates';
import type { SubmitLeadDto } from './dto/submit-lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private notifyEmail(): string {
    return (
      this.config.get<string>('leadsNotifyEmail') ||
      process.env.LEADS_NOTIFY_EMAIL ||
      'kontakt@verris.pl'
    );
  }

  private confirmUrl(token: string): string {
    const base = (
      this.config.get<string>('publicApiUrl') ||
      process.env.PUBLIC_API_URL ||
      'https://api.verris.pl'
    ).replace(/\/$/, '');
    return `${base}/public/leads/confirm?token=${encodeURIComponent(token)}`;
  }

  async submit(
    dto: SubmitLeadDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ status: 'pending' | 'received' }> {
    const email = dto.email.trim().toLowerCase();
    const kind = dto.kind === 'MIGRATION' ? SiteLeadKind.MIGRATION : SiteLeadKind.CONTACT;

    if (kind === SiteLeadKind.MIGRATION && !dto.marketingConsent) {
      // Bez zgody marketingowej nie tworzymy leada migracyjnego (PKE/RODO).
      throw new BadRequestException('Zgoda marketingowa jest wymagana dla tego formularza.');
    }

    const confirmToken = kind === SiteLeadKind.MIGRATION ? randomUUID() : null;

    const lead = await this.prisma.siteLead.create({
      data: {
        kind,
        status: kind === SiteLeadKind.MIGRATION ? SiteLeadStatus.PENDING : SiteLeadStatus.RECEIVED,
        email,
        name: dto.name?.trim() || null,
        message: dto.message?.trim() || null,
        source: dto.source || null,
        marketingConsent: Boolean(dto.marketingConsent),
        consentText: dto.consentText || null,
        consentAt: dto.marketingConsent ? new Date() : null,
        ip: meta.ip || null,
        userAgent: meta.userAgent || null,
        confirmToken,
      },
    });

    await this.audit
      .record({
        action: 'SITE_LEAD_SUBMITTED',
        details: { leadId: lead.id, kind: dto.kind, source: dto.source, page: dto.page },
      })
      .catch(() => undefined);

    // Powiadomienie wewnętrzne (best-effort).
    void this.mailer
      .send({
        ...leadNotifyTemplate({
          to: this.notifyEmail(),
          kind: dto.kind,
          email,
          name: dto.name,
          message: dto.message,
          source: dto.source,
          ip: meta.ip,
          page: dto.page,
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((e) => this.logger.warn(`lead notify mail failed: ${e?.message ?? e}`));

    if (kind === SiteLeadKind.MIGRATION && confirmToken) {
      // Double opt-in — bez potwierdzenia lead nie wchodzi do sekwencji.
      void this.mailer
        .send({
          ...leadOptInTemplate({ to: email, confirmUrl: this.confirmUrl(confirmToken) }),
          category: 'TRANSACTIONAL',
          fromRole: 'SUPPORT',
          userId: undefined,
        })
        .catch((e) => this.logger.warn(`lead opt-in mail failed: ${e?.message ?? e}`));
      return { status: 'pending' };
    }

    // CONTACT — potwierdzenie dla nadawcy.
    void this.mailer
      .send({
        ...leadContactAckTemplate({ to: email, name: dto.name }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((e) => this.logger.warn(`lead ack mail failed: ${e?.message ?? e}`));

    return { status: 'received' };
  }

  /** Double opt-in: potwierdza adres i włącza lead do sekwencji. */
  async confirm(token?: string): Promise<{ ok: boolean }> {
    if (!token) return { ok: false };
    const lead = await this.prisma.siteLead.findUnique({ where: { confirmToken: token } });
    if (!lead) return { ok: false };
    if (lead.confirmedAt) return { ok: true };

    await this.prisma.siteLead.update({
      where: { id: lead.id },
      data: {
        status: SiteLeadStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmToken: null, // token jednorazowy
      },
    });
    await this.audit
      .record({ action: 'SITE_LEAD_CONFIRMED', details: { leadId: lead.id } })
      .catch(() => undefined);
    return { ok: true };
  }
}
