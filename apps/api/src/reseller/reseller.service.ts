import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { generateAuthToken, hashAuthToken } from '../auth/auth-token.util';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { escapeMarkdown as md, renderEmailShell } from '../mail/templates/_layouts/email-shell';

type ResellerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

interface ProfileRow {
  id: string;
  userId: string;
  status: ResellerStatus;
  brandName: string | null;
  markupPct: number;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Delegaty Prisma — klient regenerowany w buildzie prod. */
interface ProfileDelegate {
  findUnique(a: { where: { userId?: string; code?: string } }): Promise<ProfileRow | null>;
  findMany(a: Record<string, unknown>): Promise<ProfileRow[]>;
  create(a: { data: Record<string, unknown> }): Promise<ProfileRow>;
  update(a: { where: { userId: string }; data: Record<string, unknown> }): Promise<ProfileRow>;
  count(a: Record<string, unknown>): Promise<number>;
}

export interface ResellerOverview {
  status: ResellerStatus;
  brandName: string | null;
  markupPct: number;
  code: string;
  inviteLink: string;
  clientsCount: number;
  monthlyRetail: number;
  monthlyWholesale: number;
}
export interface ResellerClientView {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  services: { id: string; plan: string | null; status: string; wholesale: number; retail: number; currency: string }[];
}

/** O-06 — ile kont reseller może założyć klientom w ciągu doby (decyzja właściciela 2026-09-24). */
export const LIMIT_KONT_DZIENNIE = 10;
const WAZNOSC_LINKU_H = 72;

@Injectable()
export class ResellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  private get repo(): ProfileDelegate {
    return (this.prisma as unknown as { resellerProfile: ProfileDelegate }).resellerProfile;
  }
  private clientUrl(): string {
    return (process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  async getProfile(userId: string): Promise<ProfileRow | null> {
    return this.repo.findUnique({ where: { userId } });
  }

  private async clientsWithServices(resellerId: string, markupPct: number): Promise<ResellerClientView[]> {
    const clients = await (this.prisma as unknown as {
      user: {
        findMany(a: Record<string, unknown>): Promise<Array<{
          id: string; email: string; firstName: string | null; lastName: string | null; createdAt: Date;
          subscriptions: Array<{ id: string; status: string; priceAmount: unknown; currency: string; plan: { name: string | null } | null }>;
        }>>;
      };
    }).user.findMany({
      where: { resellerOwnerId: resellerId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, email: true, firstName: true, lastName: true, createdAt: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: { id: true, status: true, priceAmount: true, currency: true, plan: { select: { name: true } } },
        },
      },
    });
    const mk = 1 + markupPct / 100;
    return clients.map((c) => ({
      id: c.id,
      email: c.email,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
      createdAt: c.createdAt.toISOString(),
      services: c.subscriptions.map((s) => {
        const wholesale = Number(s.priceAmount);
        return { id: s.id, plan: s.plan?.name ?? null, status: s.status, wholesale, retail: Math.round(wholesale * mk * 100) / 100, currency: s.currency };
      }),
    }));
  }

  async getOverview(userId: string): Promise<ResellerOverview> {
    const p = await this.getProfile(userId);
    if (!p) throw new ForbiddenException('Konto nie jest resellerem.');
    const clients = await this.clientsWithServices(userId, p.markupPct);
    let wholesale = 0;
    let retail = 0;
    for (const c of clients) for (const s of c.services) { wholesale += s.wholesale; retail += s.retail; }
    return {
      status: p.status,
      brandName: p.brandName,
      markupPct: p.markupPct,
      code: p.code,
      inviteLink: `${this.clientUrl()}/register?reseller=${encodeURIComponent(p.code)}`,
      clientsCount: clients.length,
      monthlyRetail: Math.round(retail * 100) / 100,
      monthlyWholesale: Math.round(wholesale * 100) / 100,
    };
  }

  /**
   * O-08 — klient sam składa wniosek o program: profil PENDING (link z kodem nie wiąże klientów,
   * dopóki operator nie włączy programu — auth.service sprawdza status ACTIVE).
   */
  async apply(userId: string, input: { brandName?: string }) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!u || u.role !== 'USER') throw new BadRequestException('Resellerem może być wyłącznie konto klienta.');
    const existing = await this.getProfile(userId);
    if (existing) return this.getOverview(userId);
    const brandName = (input.brandName ?? '').trim().slice(0, 80) || null;
    await this.repo.create({ data: { userId, brandName, markupPct: 20, status: 'PENDING', code: `rsl_${randomBytes(5).toString('hex')}` } });
    await this.audit.record({ action: 'RESELLER_APPLIED', userId, details: { brandName } });
    // Operator dowiaduje się o wniosku: skrzynka z RESELLER_APPLY_EMAIL, a bez niej — wszyscy
    // administratorzy (jak alerty operacyjne). Test na produkcji 2026-09-24: SECURITY_ALERT_EMAIL
    // nie jest ustawiony, więc wniosek nie trafiał do nikogo.
    const odbiorcy = process.env.RESELLER_APPLY_EMAIL
      ? [process.env.RESELLER_APPLY_EMAIL]
      : (await this.prisma.user.findMany({ where: { role: 'ADMIN', anonymizedAt: null }, select: { email: true } })).map((a) => a.email);
    for (const to of odbiorcy) {
      await this.mailer
        .send({
          to,
          subject: '[Verris] Nowy wniosek o program resellerski',
          text: `Konto (userId): ${userId}\nMarka: ${brandName ?? '(bez nazwy)'}\n\nZatwierdź albo odrzuć w panelu admina → Resellerzy.`,
          category: 'TRANSACTIONAL',
          tag: 'reseller.apply',
        })
        .catch(() => undefined);
    }
    return this.getOverview(userId);
  }

  /**
   * O-06 — reseller zakłada konto klientowi: konto od razu przypisane do resellera, bez hasła
   * (klient ustawia je z linku, 72 h). Tylko aktywny program, limit dzienny, mail mówi wprost,
   * kto założył konto (Verris + nazwa resellera) i co zrobić, gdy to pomyłka.
   */
  async createClient(resellerId: string, dto: { email: string; firstName: string; lastName: string }) {
    const p = await this.getProfile(resellerId);
    if (!p || p.status !== 'ACTIVE') throw new ForbiddenException('Program resellerski nie jest aktywny na tym koncie.');
    const od = new Date(Date.now() - 24 * 3600 * 1000);
    const dzis = await this.prisma.auditLog.count({ where: { action: 'RESELLER_CLIENT_CREATED', actorUserId: resellerId, createdAt: { gte: od } } });
    if (dzis >= LIMIT_KONT_DZIENNIE) {
      throw new HttpException(`Limit ${LIMIT_KONT_DZIENNIE} nowych kont na dobę — napisz do nas, jeśli potrzebujesz więcej.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const email = dto.email.trim().toLowerCase();
    const istnieje = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (istnieje) throw new ConflictException('Konto z tym adresem e-mail już istnieje — klient może zarejestrować się z Twojego linku zaproszenia tylko nowym adresem.');

    const rawToken = generateAuthToken();
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: 'USER',
          walletBalance: 0,
          referralCode: `EKO-${randomBytes(4).toString('hex').toUpperCase()}`,
          ecoBadgeToken: randomBytes(18).toString('base64url'),
          resellerOwnerId: resellerId,
        },
      });
      await tx.userAuthToken.create({
        data: { userId: created.id, purpose: 'PASSWORD_RESET', tokenHash: hashAuthToken(rawToken), expiresAt: new Date(Date.now() + WAZNOSC_LINKU_H * 3600 * 1000) },
      });
      return created;
    });
    await this.audit.record({ action: 'RESELLER_CLIENT_CREATED', userId: user.id, actorUserId: resellerId, details: { email } });

    const panelUrl = this.clientUrl();
    const marka = p.brandName || 'Twój partner';
    const { html, text } = renderEmailShell({
      title: 'Konto w Verris czeka na Ciebie',
      preheader: `${marka} założył(a) Ci konto hostingowe w Verris.`,
      bodyMarkdown: [
        `Cześć${dto.firstName.trim() ? ` **${md(dto.firstName.trim())}**` : ''},`,
        '',
        `**${md(marka)}** założył(a) Ci konto w Verris — hostingu, z którego korzysta przy Twojej stronie. Żeby się zalogować, ustaw hasło (link ważny ${WAZNOSC_LINKU_H} godziny).`,
        '',
        `Jeśli nie znasz ${md(marka)} albo nie spodziewałeś(-aś) się tego konta — nic nie rób: bez hasła konto jest nieaktywne. Jeśli ktoś podszywa się pod Ciebie albo dostajesz takie maile wielokrotnie, zgłoś to: ${(process.env.WWW_URL ?? 'https://verris.pl').replace(/\/$/, '')}/zglos-naduzycie`,
      ].join('\n'),
      cta: { label: 'Ustaw hasło', url: `${panelUrl}/reset-password?token=${encodeURIComponent(rawToken)}` },
      recipientEmail: email,
      panelUrl,
      recipientHasAccount: true,
    });
    let mailWyslany = true;
    try {
      await this.mailer.send({ to: email, userId: user.id, subject: `${marka} założył(a) Ci konto w Verris`, text, html, tag: 'reseller.client-created', category: 'TRANSACTIONAL', fromRole: 'NOREPLY' });
    } catch {
      mailWyslany = false;
    }
    return { id: user.id, email, mailWyslany, pozostaloDzis: LIMIT_KONT_DZIENNIE - dzis - 1 };
  }

  /** O-07 — reseller sam ustawia swój narzut (te same granice co w panelu admina: 0–300%). */
  async setMarkup(userId: string, markupPct: number) {
    const p = await this.getProfile(userId);
    if (!p || p.status !== 'ACTIVE') throw new ForbiddenException('Program resellerski nie jest aktywny na tym koncie.');
    const v = Math.round(markupPct);
    if (!Number.isFinite(v) || v < 0 || v > 300) throw new BadRequestException('Narzut: liczba całkowita od 0 do 300%.');
    await this.repo.update({ where: { userId }, data: { markupPct: v } });
    await this.audit.record({ action: 'RESELLER_MARKUP_CHANGED', userId, details: { from: p.markupPct, to: v } });
    return this.getOverview(userId);
  }

  async listClients(userId: string): Promise<ResellerClientView[]> {
    const p = await this.getProfile(userId);
    if (!p) throw new ForbiddenException('Konto nie jest resellerem.');
    return this.clientsWithServices(userId, p.markupPct);
  }

  // ---- Admin ----

  private view(p: ProfileRow) {
    return {
      userId: p.userId,
      status: p.status,
      brandName: p.brandName,
      markupPct: p.markupPct,
      code: p.code,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async adminList() {
    const rows = await this.repo.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    // Operator musi wiedzieć, KIM jest reseller / kto złożył wniosek — samo ID nic nie mówi.
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, email: true } });
    const email = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ ...this.view(r), email: email.get(r.userId) ?? null }));
  }

  async adminEnable(targetUserId: string, input: { markupPct: number; brandName?: string }, actorUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, customerOwnerId: true, anonymizedAt: true },
    });
    if (!target || target.anonymizedAt) throw new NotFoundException('Użytkownik nie istnieje.');
    if (target.role !== 'USER' || target.customerOwnerId) {
      throw new BadRequestException('Resellerem może być wyłącznie główne konto klienta (nie subkonto ani konto operatora).');
    }
    const existing = await this.getProfile(targetUserId);
    const markupPct = Math.min(Math.max(Math.round(input.markupPct) || 0, 0), 300);
    let row: ProfileRow;
    if (existing) {
      row = await this.repo.update({ where: { userId: targetUserId }, data: { markupPct, brandName: input.brandName ?? existing.brandName, status: 'ACTIVE' } });
      if (existing.status === 'PENDING') await this.powiadomOAkceptacji(row);
    } else {
      row = await this.repo.create({
        data: { userId: targetUserId, markupPct, brandName: input.brandName ?? null, status: 'ACTIVE', code: `rsl_${randomBytes(5).toString('hex')}` },
      });
    }
    await this.audit.record({ action: 'RESELLER_ENABLED', userId: actorUserId, details: { targetUserId, markupPct } });
    return this.view(row);
  }

  /** O-08 — klient dowiaduje się, że wniosek zatwierdzono i link zaproszenia już działa. Best-effort. */
  private async powiadomOAkceptacji(p: ProfileRow) {
    const u = await this.prisma.user.findUnique({ where: { id: p.userId }, select: { email: true } });
    if (!u?.email) return;
    const panelUrl = this.clientUrl();
    const link = `${panelUrl}/register?reseller=${encodeURIComponent(p.code)}`;
    const { html, text } = renderEmailShell({
      title: 'Program resellerski włączony',
      preheader: 'Twój link zaproszenia już przypisuje klientów.',
      bodyMarkdown: [
        'Cześć,',
        '',
        `zatwierdziliśmy Twój wniosek${p.brandName ? ` dla marki **${md(p.brandName)}**` : ''} — program resellerski jest aktywny. Twój narzut: **${p.markupPct}%** ceny hurtowej.`,
        '',
        `Klienci, którzy założą konto z Twojego linku, będą przypisani do Ciebie: ${link}`,
        '',
        'Przegląd klientów i przychodu znajdziesz w panelu w zakładce **Reseller**.',
      ].join('\n'),
      cta: { label: 'Otwórz panel resellera', url: `${panelUrl}/dashboard/reseller` },
      recipientEmail: u.email,
      panelUrl,
      recipientHasAccount: true,
    });
    await this.mailer
      .send({ to: u.email, subject: 'Program resellerski Verris jest aktywny', text, html, tag: 'reseller.approved', category: 'TRANSACTIONAL', fromRole: 'SUPPORT' })
      .catch(() => undefined);
  }

  async adminUpdate(targetUserId: string, input: { markupPct?: number; brandName?: string; status?: ResellerStatus }, actorUserId: string) {
    const existing = await this.getProfile(targetUserId);
    if (!existing) throw new NotFoundException('Ten użytkownik nie jest resellerem.');
    const data: Record<string, unknown> = {};
    if (input.markupPct != null) data.markupPct = Math.min(Math.max(Math.round(input.markupPct), 0), 300);
    if (input.brandName !== undefined) data.brandName = input.brandName || null;
    if (input.status) data.status = input.status;
    const row = await this.repo.update({ where: { userId: targetUserId }, data });
    await this.audit.record({ action: 'RESELLER_UPDATED', userId: actorUserId, details: { targetUserId, ...input } });
    if (existing.status === 'PENDING' && row.status === 'ACTIVE') await this.powiadomOAkceptacji(row);
    return this.view(row);
  }
}
