import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ZawieszenieOperatoraService } from '../subscriptions/zawieszenie-operatora.service.js';
import { PocztaKontaOperatoraService } from '../subscriptions/poczta-konta-operatora.service.js';
import { uprawnieniaOperatora } from '../staff-roles/uprawnienia-operatora.js';
import type { DecyzjaNaduzyciaDto, ZgloszenieNaduzyciaDto } from './abuse.dto.js';
import {
  decyzjaDlaZglaszajacego,
  noweZgloszenieDlaObslugi,
  potwierdzenieZgloszenia,
  uzasadnienieDlaKlienta,
} from './abuse.templates.js';

/** Host z adresu (bez www., małe litery) albo null, gdy to nie jest adres http(s). */
export function hostZAdresu(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** sklep.example.pl → [sklep.example.pl, example.pl] — konto może mieć domenę główną wyżej. */
export function kandydaciDomeny(host: string): string[] {
  const czesci = host.split('.');
  return czesci.slice(0, -1).map((_, i) => czesci.slice(i).join('.'));
}

/**
 * N-13 — kolejka zgłoszeń nadużyć. DSA art. 16 (zgłoszenie z URL, uzasadnieniem, danymi
 * zgłaszającego i oświadczeniem o dobrej wierze, potwierdzenie przyjęcia) i art. 17
 * (uzasadnienie dla klienta przy ograniczeniu). F2.3 (10.10): decyzja „Podjęto działania” może od razu
 * zawiesić dopasowaną usługę (te same uprawnienia co z karty usługi) albo tylko powiadomić; F3.1 — może też
 * zablokować wysyłkę poczty usługi (spam z konta). Usunięcie pliku zostaje w innych narzędziach.
 */
@Injectable()
export class AbuseService {
  private readonly logger = new Logger(AbuseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly zawieszenie: ZawieszenieOperatoraService,
    private readonly poczta: PocztaKontaOperatoraService,
  ) {}

  private adresObslugi(): string {
    return process.env.ABUSE_NOTIFY_EMAIL || 'kontakt@verris.pl';
  }

  /** Adresy paneli do linków w mailach — w produkcji wymagane przez `configuration.ts`. */
  private panele() {
    const bezUkosnika = (u: string) => u.replace(/\/$/, '');
    return {
      panelUrl: bezUkosnika(process.env.CLIENT_PANEL_URL || 'https://panel.verris.pl'),
      staffPanelUrl: bezUkosnika(process.env.STAFF_PANEL_URL || 'https://staff.verris.pl'),
    };
  }

  private wyslij(msg: Parameters<MailerService['send']>[0]) {
    void this.mailer.send(msg).catch((e) => this.logger.warn(`abuse mail: ${e?.message ?? e}`));
  }

  async zglos(dto: ZgloszenieNaduzyciaDto, meta: { ip?: string; userAgent?: string }) {
    if (dto.website) return { id: null, status: 'received' as const }; // bot — udajemy sukces
    const host = hostZAdresu(dto.url);
    if (!host) throw new BadRequestException('Podaj pełny adres strony (np. https://przyklad.pl/podstrona).');

    const kandydaci = kandydaciDomeny(host);
    const konto = await this.prisma.account.findFirst({
      where: { domain: { in: kandydaci } },
      select: { subscriptionId: true, userId: true, domain: true },
    });
    const domena = konto ? null : await this.prisma.domain.findFirst({
      where: { name: { in: kandydaci } },
      select: { userId: true, name: true },
    });

    const r = await this.prisma.abuseReport.create({
      data: {
        category: dto.category,
        url: dto.url.trim(),
        host,
        description: dto.description.trim(),
        reporterName: dto.reporterName?.trim() || null,
        reporterEmail: dto.reporterEmail.trim().toLowerCase(),
        goodFaith: dto.goodFaith,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        subscriptionId: konto?.subscriptionId ?? null,
        userId: konto?.userId ?? domena?.userId ?? null,
      },
    });

    await this.audit.record({
      action: 'ABUSE_REPORT_RECEIVED',
      userId: r.userId,
      details: { reportId: r.id, category: r.category, host, matched: Boolean(r.userId) },
      ipAddress: meta.ip ?? null,
    }).catch(() => undefined);

    this.wyslij({ ...potwierdzenieZgloszenia({ to: r.reporterEmail, id: r.id, url: r.url, kategoria: r.category, ...this.panele() }), category: 'TRANSACTIONAL', fromRole: 'SUPPORT' });
    this.wyslij({
      ...noweZgloszenieDlaObslugi({
        to: this.adresObslugi(), id: r.id, url: r.url, kategoria: r.category, ...this.panele(),
        dopasowanie: konto ? `usługa ${konto.subscriptionId} (${konto.domain})` : domena ? `domena ${domena.name} w portfelu klienta` : 'nie nasza domena albo nie znaleziono',
      }),
      category: 'TRANSACTIONAL', fromRole: 'SUPPORT',
    });
    return { id: r.id, status: 'received' as const };
  }

  lista(status?: string) {
    return this.prisma.abuseReport.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      select: { id: true, status: true, category: true, url: true, host: true, reporterEmail: true, subscriptionId: true, userId: true, createdAt: true, decidedAt: true },
    });
  }

  async szczegoly(id: string) {
    const r = await this.prisma.abuseReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Nie ma takiego zgłoszenia.');
    const klient = r.userId ? await this.prisma.user.findUnique({ where: { id: r.userId }, select: { id: true, email: true } }) : null;
    // F2.3 — dopasowana usługa i jej stan: formularz decyzji pokazuje „Zawieś usługę …” tylko dla działającej.
    const s = r.subscriptionId
      ? await this.prisma.subscription.findUnique({ where: { id: r.subscriptionId }, select: { id: true, status: true, account: { select: { domain: true } } } })
      : null;
    const usluga = s ? { id: s.id, status: s.status, domena: s.account?.domain ?? null } : null;
    return { ...r, klient, usluga };
  }

  /**
   * @param rola rola decydującego (z JWT). Zawieszenie usługi: ADMIN zawsze, STAFF tylko z SUBSCRIPTIONS_SUSPEND —
   * bez roli albo bez uprawnienia 403 (fail-closed), zanim cokolwiek się zmieni.
   */
  async decyzja(id: string, dto: DecyzjaNaduzyciaDto, staffId: string, rola?: string) {
    const r = await this.prisma.abuseReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Nie ma takiego zgłoszenia.');
    const koncowa = dto.status === 'ACTION_TAKEN' || dto.status === 'REJECTED';
    const uzasadnienie = dto.decision?.trim() ?? '';
    if (koncowa && uzasadnienie.length < 20) {
      throw new BadRequestException('Decyzja wymaga uzasadnienia (min. 20 znaków) — dostanie je zgłaszający.');
    }
    let zawieszono = false;
    let wysylkaZablokowana = false;
    // F3.1 — blokada wysyłki przed zawieszeniem: gdy się nie uda, decyzja nie zapisuje się, a maile nie wychodzą.
    if (dto.blockSending) {
      if (dto.status !== 'ACTION_TAKEN') throw new BadRequestException('Wysyłkę blokuje się razem z decyzją „Podjęto działania”.');
      if (!r.subscriptionId) throw new BadRequestException('Zgłoszenie nie jest dopasowane do usługi — zablokuj wysyłkę z karty usługi.');
      if (rola !== 'ADMIN' && !(await uprawnieniaOperatora(this.prisma, staffId)).includes('MAIL_SEND_BLOCK')) {
        throw new ForbiddenException('Blokada wysyłki wymaga uprawnienia MAIL_SEND_BLOCK. Zapisz decyzję bez blokady albo poproś osobę z uprawnieniem.');
      }
      await this.poczta.zablokuj({
        subscriptionId: r.subscriptionId,
        operatorUserId: staffId,
        operatorRole: rola ?? 'STAFF',
        powod: `Nadużycie #${r.id.slice(0, 8)}: ${uzasadnienie}`.slice(0, 500),
        zgloszenie: null,
      });
      wysylkaZablokowana = true;
    }
    if (dto.suspendService) {
      if (dto.status !== 'ACTION_TAKEN') throw new BadRequestException('Usługę zawiesza się razem z decyzją „Podjęto działania”.');
      if (!r.subscriptionId) throw new BadRequestException('Zgłoszenie nie jest dopasowane do usługi — zawieś ją z karty usługi.');
      if (rola !== 'ADMIN' && !(await uprawnieniaOperatora(this.prisma, staffId)).includes('SUBSCRIPTIONS_SUSPEND')) {
        throw new ForbiddenException('Zawieszenie usługi wymaga uprawnienia SUBSCRIPTIONS_SUSPEND. Zapisz decyzję bez zawieszenia albo wyślij wniosek z karty usługi.');
      }
      // Najpierw zawieszenie — gdy się nie uda, decyzja nie zapisuje się, a maile nie wychodzą.
      await this.zawieszenie.zawies({
        subscriptionId: r.subscriptionId,
        aktorUserId: staffId,
        reason: 'ABUSE',
        powod: `Nadużycie #${r.id.slice(0, 8)}: ${uzasadnienie}`.slice(0, 500),
      });
      zawieszono = true;
    }
    const teraz = new Date();
    let klientPowiadomiony = false;

    if (dto.status === 'ACTION_TAKEN' && dto.notifyCustomer && r.userId) {
      const klient = await this.prisma.user.findUnique({ where: { id: r.userId }, select: { email: true } });
      if (klient?.email) {
        this.wyslij({ ...uzasadnienieDlaKlienta({ to: klient.email, url: r.url, kategoria: r.category, uzasadnienie, ...this.panele() }), category: 'TRANSACTIONAL', fromRole: 'SUPPORT', userId: r.userId });
        klientPowiadomiony = true;
      }
    }
    if (koncowa) {
      this.wyslij({ ...decyzjaDlaZglaszajacego({ to: r.reporterEmail, id: r.id, url: r.url, przyjete: dto.status === 'ACTION_TAKEN', uzasadnienie, ...this.panele() }), category: 'TRANSACTIONAL', fromRole: 'SUPPORT' });
    }

    const po = await this.prisma.abuseReport.update({
      where: { id },
      data: {
        status: dto.status,
        assignedToId: r.assignedToId ?? staffId,
        ...(koncowa ? { decision: uzasadnienie, decidedAt: teraz, decidedById: staffId, reporterNotifiedAt: teraz } : {}),
        ...(klientPowiadomiony ? { customerNotifiedAt: teraz } : {}),
      },
    });
    await this.audit.record({
      action: `ABUSE_REPORT_${dto.status}`,
      userId: r.userId,
      actorUserId: staffId,
      details: { reportId: id, customerNotified: klientPowiadomiony, ...(zawieszono ? { subscriptionId: r.subscriptionId, serviceSuspended: true } : {}), ...(wysylkaZablokowana ? { subscriptionId: r.subscriptionId, sendingBlocked: true } : {}) },
    }).catch(() => undefined);
    return po;
  }
}
