import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import type { DecyzjaNaduzyciaDto, ZgloszenieNaduzyciaDto } from './abuse.dto';
import {
  decyzjaDlaZglaszajacego,
  noweZgloszenieDlaObslugi,
  potwierdzenieZgloszenia,
  uzasadnienieDlaKlienta,
} from './abuse.templates';

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
 * (uzasadnienie dla klienta przy ograniczeniu). Samo ograniczenie usługi robi obsługa
 * istniejącymi narzędziami (zawieszenie, kordon wysyłki) — tu jest proces i ślad.
 */
@Injectable()
export class AbuseService {
  private readonly logger = new Logger(AbuseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
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
    return { ...r, klient };
  }

  async decyzja(id: string, dto: DecyzjaNaduzyciaDto, staffId: string) {
    const r = await this.prisma.abuseReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Nie ma takiego zgłoszenia.');
    const koncowa = dto.status === 'ACTION_TAKEN' || dto.status === 'REJECTED';
    const uzasadnienie = dto.decision?.trim() ?? '';
    if (koncowa && uzasadnienie.length < 20) {
      throw new BadRequestException('Decyzja wymaga uzasadnienia (min. 20 znaków) — dostanie je zgłaszający.');
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
      details: { reportId: id, customerNotified: klientPowiadomiony },
    }).catch(() => undefined);
    return po;
  }
}
