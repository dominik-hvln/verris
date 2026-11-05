import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiteLeadKind, SiteLeadStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import {
  leadCallbackNotifyTemplate,
  leadContactAckTemplate,
  leadNotifyTemplate,
  leadPlanMigracjiTemplate,
} from './leads.templates.js';
import { warunekRetencjiLeadow } from './leads-retencja.js';
import type { SubmitLeadDto } from './dto/submit-lead.dto.js';
import type { SubmitCallbackDto } from './dto/submit-callback.dto.js';

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

  private panelUrl(): string {
    return (this.config.get<string>('clientPanelUrl') || 'https://panel.verris.pl').replace(/\/$/, '');
  }

  private apiUrl(): string {
    return (
      this.config.get<string>('publicApiUrl') ||
      process.env.PUBLIC_API_URL ||
      'https://api.verris.pl'
    ).replace(/\/$/, '');
  }

  private confirmUrl(token: string): string {
    return `${this.apiUrl()}/public/leads/confirm?token=${encodeURIComponent(token)}`;
  }

  private wypisUrl(token: string): string {
    return `${this.apiUrl()}/public/leads/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  async submit(
    dto: SubmitLeadDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ status: 'pending' | 'received' }> {
    const email = dto.email.trim().toLowerCase();
    const kind = dto.kind === 'MIGRATION' ? SiteLeadKind.MIGRATION : SiteLeadKind.CONTACT;

    // A2-01 (paczka 109): plan migracji dostaje każdy, kto o niego prosi — zgoda na wiadomości jest osobna
    // i dobrowolna (art. 7 ust. 4 RODO). Token potwierdzenia (double opt-in) tylko dla zaznaczonej zgody.
    const zgoda = kind === SiteLeadKind.MIGRATION && dto.marketingConsent === true;
    const confirmToken = zgoda ? randomUUID() : null;
    // Audyt bezpieczeństwa 13.10: najwyżej jeden mail do nadawcy na adres na dobę (potwierdzenie albo opt-in).
    // Kolejne zgłoszenia zapisujemy i zgłaszamy obsłudze, ale nie wysyłamy nic na niezweryfikowany adres.
    const ostatni = await this.prisma.siteLead.findFirst({
      // Ten sam rodzaj formularza — kontakt nie blokuje opt-inu migracji (przegląd paczki 42).
      where: { email, kind, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { id: true },
    });

    const lead = await this.prisma.siteLead.create({
      data: {
        kind,
        // PENDING = zgoda na wiadomości czeka na potwierdzenie; RECEIVED = plan/odpowiedź bez zgody marketingowej.
        status: zgoda ? SiteLeadStatus.PENDING : SiteLeadStatus.RECEIVED,
        email,
        name: dto.name?.trim() || null,
        message: dto.message?.trim() || null,
        source: dto.source || null,
        marketingConsent: zgoda,
        consentText: dto.consentText || null,
        consentAt: zgoda ? new Date() : null,
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
          panelUrl: this.panelUrl(),
          marketingConsent: zgoda,
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((e) => this.logger.warn(`lead notify mail failed: ${e?.message ?? e}`));

    if (ostatni) return { status: zgoda ? 'pending' : 'received' };

    if (kind === SiteLeadKind.MIGRATION) {
      // Plan migracji — mail transakcyjny (prośba osoby). Przy zgodzie: przycisk potwierdzenia i link wypisu.
      void this.mailer
        .send({
          ...leadPlanMigracjiTemplate({
            to: email,
            panelUrl: this.panelUrl(),
            potwierdzZgodeUrl: confirmToken ? this.confirmUrl(confirmToken) : null,
            wypisUrl: zgoda ? this.wypisUrl(lead.unsubToken) : null,
          }),
          category: 'TRANSACTIONAL',
          fromRole: 'SUPPORT',
          userId: undefined,
        })
        .catch((e) => this.logger.warn(`lead plan mail failed: ${e?.message ?? e}`));
      return { status: zgoda ? 'pending' : 'received' };
    }

    // CONTACT — potwierdzenie dla nadawcy.
    void this.mailer
      .send({
        ...leadContactAckTemplate({ to: email, panelUrl: this.panelUrl() }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((e) => this.logger.warn(`lead ack mail failed: ${e?.message ?? e}`));

    return { status: 'received' };
  }

  /**
   * 1.11 — prośba o telefon zwrotny (pas „Wolisz porozmawiać?” na verris.pl). Bez adresu e-mail, więc bez żadnego
   * maila do nadawcy — tylko zapis, dziennik i powiadomienie zespołu z numerem i porą dnia.
   */
  async submitCallback(
    dto: SubmitCallbackDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ status: 'received' }> {
    const phone = dto.phone.trim().replace(/\s+/g, ' ');
    const lead = await this.prisma.siteLead.create({
      data: {
        kind: SiteLeadKind.CALLBACK,
        status: SiteLeadStatus.RECEIVED,
        email: null,
        name: dto.name.trim(),
        phone,
        preferredTime: dto.preferredTime,
        source: 'callback_band',
        consentText: dto.consentText,
        ip: meta.ip || null,
        userAgent: meta.userAgent || null,
      },
    });

    await this.audit
      .record({
        action: 'SITE_LEAD_SUBMITTED',
        details: { leadId: lead.id, kind: 'CALLBACK', source: 'callback_band', page: dto.page },
      })
      .catch(() => undefined);

    const rozmowa = dto.rozmowaId ? await this.rozmowaAsystenta(dto.rozmowaId) : null;

    void this.mailer
      .send({
        ...leadCallbackNotifyTemplate({
          to: this.notifyEmail(),
          name: dto.name.trim(),
          phone,
          preferredTime: dto.preferredTime,
          page: dto.page,
          ip: meta.ip,
          panelUrl: this.panelUrl(),
          rozmowa,
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((e) => this.logger.warn(`callback notify mail failed: ${e?.message ?? e}`));

    return { status: 'received' };
  }

  /**
   * 1.11 — przebieg rozmowy z asystentem AI (prośba o telefon z okna asystenta). Tylko do maila zespołu;
   * rozmowa ma własną retencję 30 dni. Brak rozmowy (po retencji, zły id) → zwykła prośba o telefon.
   */
  private async rozmowaAsystenta(rozmowaId: string): Promise<Array<{ rola: 'USER' | 'ASSISTANT'; tresc: string }> | null> {
    const wiadomosci = await this.prisma.asystentWiadomosc
      .findMany({ where: { rozmowaId }, orderBy: { createdAt: 'asc' }, select: { rola: true, tresc: true }, take: 40 })
      .catch(() => []);
    if (!wiadomosci.length) return null;
    return wiadomosci.map((w) => ({ rola: w.rola === 'USER' ? 'USER' : 'ASSISTANT', tresc: w.tresc }));
  }

  /** Czy token potwierdzenia jest aktualny (strona GET pokazuje przycisk tylko dla ważnego tokenu). */
  async tokenPotwierdzeniaIstnieje(token?: string): Promise<boolean> {
    if (!token?.trim()) return false;
    return Boolean(await this.prisma.siteLead.findUnique({ where: { confirmToken: token.trim() }, select: { id: true } }));
  }

  /** Czy token wypisu należy do leada, który jeszcze ma zgodę (wypisany drugi raz → „już wypisano”). */
  async tokenWypisu(token?: string): Promise<'aktywny' | 'wypisany' | 'brak'> {
    if (!token?.trim()) return 'brak';
    const lead = await this.prisma.siteLead.findUnique({ where: { unsubToken: token.trim() }, select: { status: true } });
    if (!lead) return 'brak';
    return lead.status === SiteLeadStatus.UNSUBSCRIBED ? 'wypisany' : 'aktywny';
  }

  /**
   * A2-01 — wypis z wiadomości o hostingu (wycofanie zgody, art. 7 ust. 3 RODO). Zgoda gaśnie, status UNSUBSCRIBED;
   * rekord usuwa retencja po 30 dniach (leads-retencja.ts).
   */
  async unsubscribe(token?: string): Promise<{ ok: boolean }> {
    if (!token?.trim()) throw new BadRequestException('Brak tokenu wypisu — użyj linku z wiadomości.');
    const lead = await this.prisma.siteLead.findUnique({ where: { unsubToken: token.trim() } });
    if (!lead) return { ok: false };
    if (lead.status !== SiteLeadStatus.UNSUBSCRIBED) {
      await this.prisma.siteLead.update({
        where: { id: lead.id },
        data: { status: SiteLeadStatus.UNSUBSCRIBED, marketingConsent: false, confirmToken: null },
      });
      await this.audit
        .record({ action: 'SITE_LEAD_UNSUBSCRIBED', details: { leadId: lead.id } })
        .catch(() => undefined);
    }
    return { ok: true };
  }

  /** A2-02 — retencja formularzy www (okresy w leads-retencja.ts, polityka prywatności 1.2.0 §4). */
  async usunStare(now = new Date()): Promise<number> {
    const { count } = await this.prisma.siteLead.deleteMany({ where: warunekRetencjiLeadow(now) });
    return count;
  }

  /** Double opt-in zgody na wiadomości: potwierdza zgodę (plan migracji poszedł już wcześniej). */
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
