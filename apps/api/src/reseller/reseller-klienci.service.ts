import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { generateAuthToken, hashAuthToken } from '../auth/auth-token.util.js';
import { escapeMarkdown as md, renderEmailShell } from '../mail/templates/_layouts/email-shell.js';

const WAZNOSC_LINKU_H = 72;
/** Ponowny link „ustaw hasło” — najwyżej raz na 10 minut na klienta (mail ląduje u klienta, nie u resellera). */
const ODSTEP_LINKU_MS = 10 * 60 * 1000;

/**
 * O-05 — co reseller widzi i może zrobić na kontach swoich klientów.
 *
 * GRANICA DANYCH (decyzja właściciela 2026-09-25): wyłącznie usługi i ich stan —
 * domena, pakiet, status, stan zdrowia, termin odnowienia. Żadnych plików, baz, poczty,
 * faktur, salda, danych rozliczeniowych, logowań ani adresów IP, i żadnego wchodzenia
 * na konto. Test `reseller-klienci.service.spec.ts` pilnuje listy pól odpowiedzi.
 * Reseller, który ma pracować przy stronie, dostaje dostęp od klienta przez IAM.
 */
export interface UslugaKlientaResellera {
  id: string;
  plan: string | null;
  domena: string | null;
  status: string;
  zdrowie: 'healthy' | 'attention' | 'critical' | 'pending';
  odnowienie: string | null;
  cenaDetaliczna: number;
  waluta: string;
  /** Wstrzymana przez tego resellera — tylko takie reseller może wznowić. */
  wstrzymanaPrzezCiebie: boolean;
}
export interface KlientResellera {
  id: string;
  email: string;
  imieNazwisko: string | null;
  od: string;
  uslugi: UslugaKlientaResellera[];
}

export function ostatniPowodWstrzymania(events: { details: unknown }[]): string | null {
  const d = events[0]?.details;
  return d && typeof d === 'object' && !Array.isArray(d) ? ((d as { reason?: string }).reason ?? null) : null;
}

function zdrowie(score: number | undefined): UslugaKlientaResellera['zdrowie'] {
  if (score === undefined) return 'pending';
  return score >= 80 ? 'healthy' : score >= 50 ? 'attention' : 'critical';
}

@Injectable()
export class ResellerKlienciService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly subs: SubscriptionsService,
  ) {}

  private panelUrl(): string {
    return (process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  private async profil(resellerId: string, wymagajAktywnego = true) {
    const p = await this.prisma.resellerProfile.findUnique({ where: { userId: resellerId } });
    if (!p) throw new ForbiddenException('Konto nie jest resellerem.');
    if (wymagajAktywnego && p.status !== 'ACTIVE') throw new ForbiddenException('Program resellerski nie jest aktywny na tym koncie.');
    return p;
  }

  /** Klient musi należeć do tego resellera — cudzy klient i nieistniejący wyglądają tak samo (404). */
  private async klient(resellerId: string, clientId: string) {
    const c = await this.prisma.user.findFirst({
      where: { id: clientId, resellerOwnerId: resellerId, anonymizedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
    });
    if (!c) throw new NotFoundException('Nie ma takiego klienta na Twojej liście.');
    return c;
  }

  async szczegoly(resellerId: string, clientId: string): Promise<KlientResellera> {
    const p = await this.profil(resellerId, false);
    const c = await this.klient(resellerId, clientId);
    const subs = await this.prisma.subscription.findMany({
      where: { userId: c.id, status: { notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        priceAmount: true,
        currency: true,
        currentPeriodEnd: true,
        plan: { select: { name: true } },
        account: { select: { domain: true } },
        healthSnapshots: { orderBy: { computedAt: 'desc' }, take: 1, select: { score: true } },
        events: { where: { type: 'SUSPENDED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { details: true } },
      },
    });
    const mk = 1 + p.markupPct / 100;
    return {
      id: c.id,
      email: c.email,
      imieNazwisko: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
      od: c.createdAt.toISOString(),
      uslugi: subs.map((s) => ({
        id: s.id,
        plan: s.plan?.name ?? null,
        domena: s.account?.domain ?? null,
        status: s.status,
        zdrowie: zdrowie(s.healthSnapshots[0]?.score),
        odnowienie: s.currentPeriodEnd?.toISOString() ?? null,
        cenaDetaliczna: Math.round(Number(s.priceAmount) * mk * 100) / 100,
        waluta: s.currency,
        wstrzymanaPrzezCiebie: s.status === SubscriptionStatus.SUSPENDED && ostatniPowodWstrzymania(s.events) === 'RESELLER',
      })),
    };
  }

  private async mailDoKlienta(to: string, userId: string, temat: string, tytul: string, tresc: string[], cta?: { label: string; url: string }) {
    const panelUrl = this.panelUrl();
    const { html, text } = renderEmailShell({ title: tytul, bodyMarkdown: tresc.join('\n'), cta, recipientEmail: to, panelUrl, recipientHasAccount: true });
    try {
      await this.mailer.send({ to, userId, subject: temat, text, html, tag: 'reseller.client-action', category: 'TRANSACTIONAL', fromRole: 'NOREPLY' });
      return true;
    } catch {
      return false;
    }
  }

  async linkHasla(resellerId: string, clientId: string) {
    const p = await this.profil(resellerId);
    const c = await this.klient(resellerId, clientId);
    const ostatni = await this.prisma.auditLog.findFirst({
      where: { action: 'RESELLER_CLIENT_PASSWORD_LINK', userId: c.id, createdAt: { gte: new Date(Date.now() - ODSTEP_LINKU_MS) } },
      select: { id: true },
    });
    if (ostatni) throw new HttpException('Link wysłaliśmy przed chwilą — kolejny możesz wysłać za 10 minut.', HttpStatus.TOO_MANY_REQUESTS);

    const raw = generateAuthToken();
    await this.prisma.$transaction([
      // Stare, niewykorzystane linki przestają działać — w obiegu jest zawsze jeden.
      this.prisma.userAuthToken.updateMany({ where: { userId: c.id, purpose: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.userAuthToken.create({
        data: { userId: c.id, purpose: 'PASSWORD_RESET', tokenHash: hashAuthToken(raw), expiresAt: new Date(Date.now() + WAZNOSC_LINKU_H * 3600 * 1000) },
      }),
    ]);
    await this.audit.record({ action: 'RESELLER_CLIENT_PASSWORD_LINK', userId: c.id, actorUserId: resellerId });
    const marka = p.brandName || 'Twój partner';
    const wyslany = await this.mailDoKlienta(
      c.email,
      c.id,
      `${marka}: link do ustawienia hasła w Verris`,
      'Ustaw hasło do panelu',
      [
        `**${md(marka)}**, który prowadzi Twoje konto, wysłał Ci link do ustawienia hasła (ważny ${WAZNOSC_LINKU_H} godziny). Poprzednie linki przestały działać.`,
        '',
        'Jeśli nie prosiłeś(-aś) o to — zignoruj tę wiadomość. Twoje obecne hasło działa dalej.',
      ],
      { label: 'Ustaw hasło', url: `${this.panelUrl()}/reset-password?token=${encodeURIComponent(raw)}` },
    );
    return { mailWyslany: wyslany };
  }

  private async uslugaKlienta(clientId: string, serviceId: string) {
    const s = await this.prisma.subscription.findFirst({
      where: { id: serviceId, userId: clientId },
      select: { id: true, status: true, account: { select: { domain: true } }, events: { where: { type: 'SUSPENDED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { details: true } } },
    });
    if (!s) throw new NotFoundException('Nie ma takiej usługi u tego klienta.');
    return s;
  }

  async wstrzymaj(resellerId: string, clientId: string, serviceId: string) {
    const p = await this.profil(resellerId);
    const c = await this.klient(resellerId, clientId);
    const s = await this.uslugaKlienta(c.id, serviceId);
    if (s.status === SubscriptionStatus.SUSPENDED) throw new ConflictException('Ta usługa jest już wstrzymana.');
    if (s.status !== SubscriptionStatus.ACTIVE && s.status !== SubscriptionStatus.PAST_DUE) {
      throw new ConflictException('Wstrzymać można tylko działającą usługę.');
    }
    await this.subs.suspend({ subscriptionId: s.id, reason: 'RESELLER', actorUserId: resellerId, note: `Wstrzymane przez resellera ${p.brandName ?? p.code}` });
    const marka = p.brandName || 'Twój partner';
    await this.mailDoKlienta(
      c.email,
      c.id,
      `${marka} wstrzymał(a) usługę ${s.account?.domain ?? ''}`.trim(),
      'Usługa wstrzymana przez partnera',
      [
        `**${md(marka)}**, który prowadzi Twoje konto, wstrzymał(a) usługę${s.account?.domain ? ` **${md(s.account.domain)}**` : ''}. Strona i poczta na tej usłudze nie działają do czasu wznowienia.`,
        '',
        `Wznowić ją może ${md(marka)} albo nasza obsługa. Jeśli to pomyłka albo nie znasz powodu, skontaktuj się z partnerem albo napisz do nas: kontakt@verris.pl.`,
        '',
        'Możesz też w każdej chwili odpiąć konto od partnera w Ustawieniach — konto i usługi zostają bez zmian.',
      ],
      { label: 'Otwórz panel', url: `${this.panelUrl()}/dashboard/services/${s.id}` },
    );
    return this.szczegoly(resellerId, clientId);
  }

  async wznow(resellerId: string, clientId: string, serviceId: string) {
    const p = await this.profil(resellerId);
    const c = await this.klient(resellerId, clientId);
    const s = await this.uslugaKlienta(c.id, serviceId);
    if (s.status !== SubscriptionStatus.SUSPENDED) throw new ConflictException('Ta usługa nie jest wstrzymana.');
    // Reseller zdejmuje wyłącznie własną blokadę — nie zaległą płatność, nie nadużycie, nie decyzję obsługi.
    if (ostatniPowodWstrzymania(s.events) !== 'RESELLER') {
      throw new ForbiddenException('Tę usługę wstrzymaliśmy my (płatność albo decyzja obsługi) — wznowić ją może tylko klient albo nasza obsługa.');
    }
    await this.subs.unsuspend({ subscriptionId: s.id, actorUserId: resellerId, note: `Wznowione przez resellera ${p.brandName ?? p.code}` });
    const marka = p.brandName || 'Twój partner';
    await this.mailDoKlienta(c.email, c.id, `${marka} wznowił(a) usługę ${s.account?.domain ?? ''}`.trim(), 'Usługa znów działa', [
      `**${md(marka)}** wznowił(a) usługę${s.account?.domain ? ` **${md(s.account.domain)}**` : ''}. Strona i poczta działają jak wcześniej.`,
    ]);
    return this.szczegoly(resellerId, clientId);
  }

  /** Odpięcie przez resellera — klient zostaje samodzielnym klientem Verris, konto i usługi bez zmian. */
  async odepnij(resellerId: string, clientId: string) {
    const p = await this.profil(resellerId, false);
    const c = await this.klient(resellerId, clientId);
    await this.prisma.user.update({ where: { id: c.id }, data: { resellerOwnerId: null } });
    await this.audit.record({ action: 'RESELLER_CLIENT_DETACHED', userId: c.id, actorUserId: resellerId, details: { przez: 'reseller' } });
    const marka = p.brandName || 'Twój partner';
    await this.mailDoKlienta(c.email, c.id, 'Twoje konto w Verris jest teraz samodzielne', 'Konto odpięte od partnera', [
      `**${md(marka)}** odpiął(-ęła) Twoje konto od swojej obsługi. Konto, usługi, dane i płatności zostają bez zmian — od teraz jesteś naszym bezpośrednim klientem.`,
      '',
      'W razie pytań pisz do nas: kontakt@verris.pl.',
    ]);
    return { ok: true as const };
  }

  // ---- strona klienta ----

  /** Kto prowadzi konto — klient widzi to zawsze (nic nie ukrywamy przed klientem). */
  async partnerKlienta(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { resellerOwnerId: true } });
    if (!u?.resellerOwnerId) return null;
    const p = await this.prisma.resellerProfile.findUnique({
      where: { userId: u.resellerOwnerId },
      select: { status: true, brandName: true, code: true, logoMime: true, logoVersion: true, user: { select: { email: true } } },
    });
    if (!p || p.status !== 'ACTIVE') return null;
    const api = (process.env.PUBLIC_API_URL || process.env.API_BASE_URL || 'https://api.verris.pl').replace(/\/$/, '');
    return {
      nazwa: p.brandName || p.user.email,
      logoUrl: p.logoMime ? `${api}/public/reseller-logo/${encodeURIComponent(p.code)}?v=${p.logoVersion}` : null,
      kontakt: p.user.email,
    };
  }

  /** Odpięcie przez samego klienta. Reseller dostaje krótką informację. */
  async odepnijSie(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { resellerOwnerId: true, email: true } });
    if (!u?.resellerOwnerId) throw new ConflictException('Twoje konto nie jest przypisane do partnera.');
    const resellerId = u.resellerOwnerId;
    await this.prisma.user.update({ where: { id: userId }, data: { resellerOwnerId: null } });
    await this.audit.record({ action: 'RESELLER_CLIENT_DETACHED', userId, actorUserId: userId, details: { przez: 'klient', resellerId } });
    const r = await this.prisma.user.findUnique({ where: { id: resellerId }, select: { email: true } });
    if (r?.email) {
      await this.mailDoKlienta(r.email, resellerId, 'Klient odpiął konto od Twojej obsługi', 'Klient odpiął konto', [
        `Klient **${md(u.email)}** odpiął swoje konto od Twojego programu resellerskiego. Nie widzisz go już na liście klientów.`,
      ]);
    }
    return { ok: true as const };
  }
}
