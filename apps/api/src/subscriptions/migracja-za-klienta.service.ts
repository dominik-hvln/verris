import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MigrationStatus, Prisma } from '@verris/database';
import * as nodeCrypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MigrationActions } from '../common/audit/audit.actions.js';
import { MailerService } from '../mail/mailer.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { escapeMarkdown, renderEmailShell } from '../mail/templates/_layouts/email-shell.js';
import { CreateMigrationBundleDto } from './dto/migration.dto.js';
import { MigrationPreflightService, PreflightSummary } from './migration-preflight.service.js';
import {
  MigrationOrchestratorService,
  MigrationRequestSummary,
  PROSBA_JUZ_ROZPATRZONA,
  normalizujZlecenie,
  szkicBezDecyzji,
} from './migration-orchestrator.service.js';

/**
 * PB-45 (decyzja właściciela 08.10) — obsługa wypełnia migrację za klienta (np. z danych ze zgłoszenia),
 * a ta rusza dopiero po kliknięciu „Zgadzam się” przez klienta (upoważnienie RODO/DPA, ten sam tekst co
 * w kreatorze). Do tego czasu zlecenie stoi w DRAFT: scheduler bierze tylko QUEUED, worker dostaje kroki
 * tylko istniejące (a DRAFT ich nie ma), więc nic nie dotyka starego hostingu ani konta klienta.
 * Dane źródła leżą zaszyfrowane jak przy kreatorze; bez decyzji w terminie — anulowane i skasowane.
 */
export const ZGODA_WAZNOSC_DNI = 7;

const JUZ_CZEKA =
  'Dla tej usługi czeka już migracja na zgodę klienta. Anuluj ją w szczegółach zlecenia (kolejka migracji) albo poczekaj na decyzję.';

export type StanProsby = 'oczekuje' | 'zaakceptowana' | 'odrzucona' | 'wygasla' | 'anulowana';

export interface ProsbaOZgode {
  id: string;
  stan: StanProsby;
  targetDomain: string | null;
  createdAt: string;
  wygasa: string | null;
  decyzjaAt: string | null;
  ticketId: string | null;
  /** Co i skąd przenosimy — bez haseł. `null`, gdy dane źródła są już skasowane. */
  zrodlo: {
    ftp: { protocol: string; host: string; port: number; username: string; remotePath: string } | null;
    mysql: Array<{ host: string; port: number; database: string; username: string | null }>;
    imap: Array<{ email: string; host: string }>;
    utworzBrakujaceSkrzynki: boolean;
    notes: string | null;
  } | null;
}

/** W bazie tylko skrót — token z maila nie daje się odczytać z kopii bazy. */
export function hashTokenuZgody(token: string): string {
  return nodeCrypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function zgodne(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && nodeCrypto.timingSafeEqual(x, y);
}

type Wiersz = Prisma.MigrationRequestGetPayload<object>;

@Injectable()
export class MigracjaZaKlientaService {
  private readonly logger = new Logger(MigracjaZaKlientaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: MigrationOrchestratorService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly preflight: MigrationPreflightService,
  ) {}

  /**
   * Usługa i klient do nagłówka formularza „Migracja za klienta”. Za tym samym uprawnieniem co założenie
   * (MIGRATIONS_MANAGE): formularz brał to z GET admin/subscriptions/:id (SUBSCRIPTIONS_MANAGE), więc operator
   * z samym MIGRATIONS_MANAGE (rola „Operacje”) nie mógł otworzyć formularza, choć API pozwalało założyć migrację.
   */
  async uslugaDoFormularza(subscriptionId: string): Promise<{
    id: string;
    user: { email: string; firstName: string | null; lastName: string | null };
    account: { domain: string } | null;
  }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, user: { select: { email: true, firstName: true, lastName: true } }, account: { select: { domain: true } } },
    });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    return sub;
  }

  /** Test dostępów z formularza obsługi — ten sam co „Test dostępów” w kreatorze klienta, w dzienniku operator. */
  async testDostepow(opts: { subscriptionId: string; actorUserId: string; zlecenie: CreateMigrationBundleDto }): Promise<PreflightSummary> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: opts.subscriptionId }, select: { id: true, userId: true } });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    return this.preflight.preflightBundle(normalizujZlecenie(opts.zlecenie), sub.userId, sub.id, opts.actorUserId);
  }

  /**
   * Obsługa (STAFF z MIGRATIONS_MANAGE albo ADMIN) zakłada migrację za klienta. Te same walidacje co
   * kreator klienta (`sprawdzZlecenie`), bez zgody — tę daje klient. Zwraca podsumowanie, termin i to,
   * czy mail z prośbą wyszedł (gdy nie — klient i tak widzi baner w Migracjach).
   */
  async utworz(opts: {
    subscriptionId: string;
    actorUserId: string;
    powod: string;
    ticketId?: string | null;
    zlecenie: CreateMigrationBundleDto;
  }): Promise<{ migracja: MigrationRequestSummary; wygasa: string; mailWyslany: boolean }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: opts.subscriptionId },
      include: { account: true, user: { select: { id: true, email: true, firstName: true } } },
    });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    if (!sub.account) {
      throw new BadRequestException('Ta usługa nie ma konta hostingowego — nie ma dokąd przenieść danych.');
    }
    if (opts.ticketId) {
      const zgl = await this.prisma.ticket.findFirst({ where: { id: opts.ticketId, userId: sub.userId }, select: { id: true } });
      if (!zgl) throw new BadRequestException('To zgłoszenie nie należy do tego klienta.');
    }

    const teraz = new Date();
    // Przeterminowana prośba tej usługi (cron chodzi co godzinę) nie blokuje nowej — zamykamy ją od razu.
    await this.wygasPrzeterminowane(teraz, sub.id);
    const oczekujace = await this.prisma.migrationRequest.count({
      where: { subscriptionId: sub.id, status: MigrationStatus.DRAFT, consentDecidedAt: null, consentExpiresAt: { gt: teraz } },
    });
    if (oczekujace > 0) throw new BadRequestException(JUZ_CZEKA);

    // Zgoda klienta nigdy nie przychodzi od operatora — nawet gdyby formularz ją przysłał.
    const dto = normalizujZlecenie({ ...opts.zlecenie, consentAccepted: undefined });
    await this.orchestrator.sprawdzZlecenie(sub.id, sub.userId, dto, { wymagajZgody: false });


    const token = nodeCrypto.randomBytes(32).toString('base64url');
    const wygasa = new Date(teraz.getTime() + ZGODA_WAZNOSC_DNI * 24 * 60 * 60 * 1000);
    // Równoległe założenie (dwóch operatorów, dwie karty) zatrzymuje częściowy indeks unikalny
    // MigrationRequest_oczekujaca_zgoda_key — drugi dostaje ten sam komunikat, bez drugiego maila.
    const req = await this.prisma.migrationRequest.create({
      data: {
        subscriptionId: sub.id,
        userId: sub.userId,
        sourceBundleEnc: this.orchestrator.zaszyfrujPakiet(dto),
        targetDomain: dto.targetDomain ?? null,
        sourcePanelType: dto.sourcePanelType ?? 'manual',
        status: MigrationStatus.DRAFT,
        currentStep: 'consent',
        ticketId: opts.ticketId ?? null,
        consentTokenHash: hashTokenuZgody(token),
        consentExpiresAt: wygasa,
        requestedByOperatorId: opts.actorUserId,
        operatorReason: opts.powod,
      },
    }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new BadRequestException(JUZ_CZEKA);
      throw e;
    });

    const domena = dto.targetDomain ?? sub.account.domain;
    const zrodla = { ftp: !!dto.ftp, mysql: dto.mysql?.length ?? 0, imap: dto.imap?.length ?? 0 };
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        type: 'MIGRATION_CONSENT_REQUESTED',
        details: { migrationRequestId: req.id, targetDomain: domena, expiresAt: wygasa.toISOString(), sources: zrodla },
      },
    });
    await this.audit.record({
      action: MigrationActions.MIGRATION_CONSENT_REQUESTED,
      userId: sub.userId,
      actorUserId: opts.actorUserId,
      details: {
        subscriptionId: sub.id,
        migrationRequestId: req.id,
        domain: domena,
        powod: opts.powod,
        ticketId: opts.ticketId ?? null,
        expiresAt: wygasa.toISOString(),
        sources: zrodla,
      },
    });

    let mailWyslany = false;
    try {
      const wynik = await this.mailer.send({
        to: sub.user.email,
        // userId — marka partnera dla klienta resellera (applyPartnerBrand) i EmailLog przypięty do konta.
        userId: sub.userId,
        subject: `Przygotowaliśmy przeniesienie ${domena} — potrzebna Twoja zgoda`,
        ...this.mailProsby(sub.user.email, sub.user.firstName, {
          domena,
          zrodla,
          wygasa,
          link: this.linkZgody(sub.id, req.id, token),
        }),
        tag: 'migration.consent-request',
        category: 'TRANSACTIONAL',
        fromRole: 'NOREPLY',
      });
      mailWyslany = wynik.delivered !== false;
    } catch (err) {
      this.logger.warn(`migration consent mail failed request=${req.id}: ${(err as Error).message}`);
    }

    const { jobs: _bezKrokow, ...migracja } = await this.orchestrator.getBundleDetailForUser(sub.id, sub.userId, req.id);
    return { migracja, wygasa: wygasa.toISOString(), mailWyslany };
  }

  /** Szczegóły prośby dla klienta: co i skąd (bez haseł), termin, stan. */
  async szczegoly(opts: { subscriptionId: string; userId: string; migrationId: string; token?: string }): Promise<ProsbaOZgode> {
    const req = await this.znajdz(opts);
    return this.widok(req);
  }

  /**
   * „Zgadzam się” — ponowna walidacja (od przygotowania minęły dni: limit migracji, logowanie do skrzynek)
   * i kolejkowanie tą samą ścieżką co kreator klienta, z IP i czasem zgody w dzienniku.
   */
  async przyjmij(opts: {
    subscriptionId: string;
    userId: string;
    actorUserId: string;
    migrationId: string;
    token?: string;
    ip: string | null;
  }): Promise<MigrationRequestSummary> {
    const req = await this.znajdz(opts);
    this.wymagajOczekujacej(req);
    const sub = await this.prisma.subscription.findFirst({
      where: { id: opts.subscriptionId, userId: opts.userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');

    const dto: CreateMigrationBundleDto = { ...this.orchestrator.odszyfrujPakiet(req.sourceBundleEnc), consentAccepted: true };
    await this.orchestrator.sprawdzZlecenie(sub.id, opts.userId, dto, { wymagajZgody: true });

    const teraz = new Date();
    let summary: MigrationRequestSummary;
    try {
      summary = await this.orchestrator.zakolejkujZlecenie(sub, opts.userId, dto, {
        actorUserId: opts.actorUserId,
        zgoda: {
          accepted: true,
          at: teraz.toISOString(),
          basis: 'client_authorization_dpa',
          ip: opts.ip,
          via: 'operator_request',
          requestedBy: req.requestedByOperatorId,
        },
        szkic: { id: req.id, dane: { consentDecidedAt: teraz, consentIp: opts.ip } },
      });
    } catch (e) {
      // Warunkowe przejście DRAFT → QUEUED nie trafiło: równoległe kliknięcie, odrzucenie albo wygaśnięcie.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new BadRequestException(PROSBA_JUZ_ROZPATRZONA);
      }
      throw e;
    }

    await this.audit.record({
      action: MigrationActions.MIGRATION_CONSENT_ACCEPTED,
      userId: opts.userId,
      actorUserId: opts.actorUserId,
      ipAddress: opts.ip ?? undefined,
      details: {
        subscriptionId: sub.id,
        migrationRequestId: req.id,
        domain: req.targetDomain ?? sub.account?.domain ?? null,
        requestedBy: req.requestedByOperatorId,
        at: teraz.toISOString(),
      },
    });
    await this.powiadomOperatora(req, 'Klient zgodził się na migrację', 'Migracja jest w kolejce — rusza automatycznie.');
    return summary;
  }

  /** „Nie zgadzam się” — zlecenie anulowane, dane źródła skasowane od razu. */
  async odrzuc(opts: {
    subscriptionId: string;
    userId: string;
    actorUserId: string;
    migrationId: string;
    token?: string;
    ip: string | null;
  }): Promise<ProsbaOZgode> {
    const req = await this.znajdz(opts);
    this.wymagajOczekujacej(req);
    const teraz = new Date();
    const zamkniete = await this.zamknij(req.id, 'consent-rejected', teraz);
    if (!zamkniete) throw new BadRequestException(PROSBA_JUZ_ROZPATRZONA);

    await this.prisma.subscriptionEvent.create({
      data: { subscriptionId: req.subscriptionId, type: 'MIGRATION_CONSENT_REJECTED', details: { migrationRequestId: req.id } },
    });
    await this.audit.record({
      action: MigrationActions.MIGRATION_CONSENT_REJECTED,
      userId: opts.userId,
      actorUserId: opts.actorUserId,
      ipAddress: opts.ip ?? undefined,
      details: { subscriptionId: req.subscriptionId, migrationRequestId: req.id, domain: req.targetDomain, secretsPurged: true },
    });
    await this.powiadomOperatora(req, 'Klient nie zgodził się na migrację', 'Zlecenie anulowane, dane dostępowe skasowane.');
    return this.widok(await this.prisma.migrationRequest.findUniqueOrThrow({ where: { id: req.id } }));
  }

  /**
   * Bez decyzji w terminie — anulowane, dane źródła skasowane (cron co godzinę, idempotentne; przy zakładaniu
   * nowej prośby — tylko dla tej usługi). Prośby właśnie zatwierdzanej (rezerwacja) nie ruszamy.
   */
  async wygasPrzeterminowane(teraz = new Date(), subscriptionId?: string): Promise<{ wygasle: number }> {
    const przeterminowane = await this.prisma.migrationRequest.findMany({
      where: {
        ...szkicBezDecyzji(teraz),
        requestedByOperatorId: { not: null },
        consentExpiresAt: { lt: teraz },
        ...(subscriptionId ? { subscriptionId } : {}),
      },
      take: 100,
    });
    let wygasle = 0;
    for (const req of przeterminowane) {
      if (!(await this.zamknij(req.id, 'consent-expired', teraz))) continue;
      wygasle += 1;
      await this.prisma.subscriptionEvent.create({
        data: { subscriptionId: req.subscriptionId, type: 'MIGRATION_CONSENT_EXPIRED', details: { migrationRequestId: req.id } },
      });
      await this.audit.record({
        action: MigrationActions.MIGRATION_CONSENT_EXPIRED,
        userId: req.userId,
        details: { subscriptionId: req.subscriptionId, migrationRequestId: req.id, domain: req.targetDomain, secretsPurged: true },
      });
      await this.powiadomOperatora(req, 'Prośba o zgodę na migrację wygasła', 'Klient nie odpowiedział w terminie — zlecenie anulowane, dane dostępowe skasowane.');
    }
    if (wygasle > 0) this.logger.log(`migration consent: expired ${wygasle} request(s)`);
    return { wygasle };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cronWygasniecia(): Promise<void> {
    try {
      await this.wygasPrzeterminowane();
    } catch (err) {
      this.logger.warn(`migration consent expiry failed: ${(err as Error).message}`);
    }
  }

  // --- pomocnicze ---------------------------------------------------------------

  /**
   * Prośba należy do klienta i tej usługi (inaczej 404 — nie zdradzamy, że istnieje). Token z maila, gdy
   * podany, musi pasować do TEJ prośby: cudzy albo zmyślony token = 404. Z banera w panelu klient wchodzi
   * bez tokenu — wtedy wystarcza sesja właściciela usługi.
   */
  private async znajdz(opts: { subscriptionId: string; userId: string; migrationId: string; token?: string }): Promise<Wiersz> {
    const req = await this.prisma.migrationRequest.findFirst({
      where: {
        id: opts.migrationId,
        subscriptionId: opts.subscriptionId,
        userId: opts.userId,
        requestedByOperatorId: { not: null },
      },
    });
    const brak = new NotFoundException('Nie znaleziono prośby o zgodę na migrację. Sprawdź, czy link jest kompletny.');
    if (!req) throw brak;
    if (opts.token !== undefined && (!req.consentTokenHash || !zgodne(hashTokenuZgody(opts.token), req.consentTokenHash))) {
      throw brak;
    }
    return req;
  }

  private wymagajOczekujacej(req: Wiersz): void {
    if (req.consentDecidedAt) throw new BadRequestException('Ta prośba o zgodę została już rozpatrzona.');
    if (req.status !== MigrationStatus.DRAFT || req.secretsPurgedAt) {
      throw new BadRequestException('Ta migracja została anulowana — poproś obsługę o przygotowanie jej ponownie.');
    }
    if (!req.consentExpiresAt || req.consentExpiresAt <= new Date()) {
      throw new BadRequestException(
        'Link do zgody wygasł, a dane dostępowe usunęliśmy. Poproś obsługę o przygotowanie migracji ponownie albo uruchom ją sam(a) w zakładce Migracje.',
      );
    }
  }

  /** Warunkowe zamknięcie oczekującej prośby (odrzucenie/wygaśnięcie) z natychmiastowym skasowaniem danych źródła. */
  private async zamknij(id: string, krok: 'consent-rejected' | 'consent-expired', teraz: Date): Promise<boolean> {
    const { count } = await this.prisma.migrationRequest.updateMany({
      // Odrzucenie przegrywa z trwającym przyjęciem (rezerwacja); wygaśnięcie zamyka też porzuconą rezerwację.
      where: krok === 'consent-rejected' ? { id, status: MigrationStatus.DRAFT, consentDecidedAt: null } : { id, ...szkicBezDecyzji(teraz) },
      data: {
        status: MigrationStatus.CANCELED,
        currentStep: krok,
        completedAt: teraz,
        ...(krok === 'consent-rejected' ? { consentDecidedAt: teraz } : {}),
        sourceBundleEnc: '',
        secretsPurgedAt: teraz,
      },
    });
    return count === 1;
  }

  private widok(req: Wiersz): ProsbaOZgode {
    const teraz = new Date();
    let stan: StanProsby;
    if (req.status === MigrationStatus.DRAFT) {
      stan = req.consentExpiresAt && req.consentExpiresAt > teraz ? 'oczekuje' : 'wygasla';
    } else if (req.currentStep === 'consent-rejected') {
      stan = 'odrzucona';
    } else if (req.currentStep === 'consent-expired') {
      stan = 'wygasla';
    } else if (req.consentDecidedAt) {
      stan = 'zaakceptowana';
    } else {
      stan = 'anulowana';
    }
    let zrodlo: ProsbaOZgode['zrodlo'] = null;
    if (!req.secretsPurgedAt && req.sourceBundleEnc) {
      try {
        const d = this.orchestrator.odszyfrujPakiet(req.sourceBundleEnc);
        zrodlo = {
          ftp: d.ftp
            ? {
                protocol: d.ftp.protocol ?? 'sftp',
                host: d.ftp.host,
                port: d.ftp.port,
                username: d.ftp.username,
                remotePath: d.ftp.remotePath ?? '/',
              }
            : null,
          mysql: (d.mysql ?? []).map((m) => ({ host: m.host, port: m.port, database: m.database, username: m.username ?? null })),
          imap: (d.imap ?? []).map((m) => ({ email: m.email ?? m.username ?? '', host: m.host })),
          utworzBrakujaceSkrzynki: d.utworzBrakujaceSkrzynki === true,
          notes: d.notes ?? null,
        };
      } catch {
        zrodlo = null;
      }
    }
    return {
      id: req.id,
      stan,
      targetDomain: req.targetDomain,
      createdAt: req.createdAt.toISOString(),
      wygasa: req.consentExpiresAt?.toISOString() ?? null,
      decyzjaAt: req.consentDecidedAt?.toISOString() ?? null,
      ticketId: req.ticketId,
      zrodlo,
    };
  }

  private async powiadomOperatora(req: Wiersz, tytul: string, tresc: string): Promise<void> {
    if (!req.requestedByOperatorId) return;
    await this.notifications.create({
      userId: req.requestedByOperatorId,
      category: 'SYSTEM',
      severity: 'info',
      title: `${tytul}${req.targetDomain ? ` — ${req.targetDomain}` : ''}`,
      body: tresc,
      link: `/migrations/${req.id}`,
      dedupeKey: `migration-consent:${req.id}`,
    });
  }

  private panelUrl(): string {
    return (process.env.CLIENT_PANEL_URL || 'https://panel.verris.pl').replace(/\/$/, '');
  }

  private linkZgody(subscriptionId: string, migrationId: string, token: string): string {
    const q = new URLSearchParams({ serviceId: subscriptionId, id: migrationId, token });
    return `${this.panelUrl()}/dashboard/migrations/zgoda?${q.toString()}`;
  }

  private mailProsby(
    to: string,
    firstName: string | null,
    m: { domena: string; zrodla: { ftp: boolean; mysql: number; imap: number }; wygasa: Date; link: string },
  ) {
    const panelUrl = this.panelUrl();
    const co = [
      m.zrodla.ftp ? '- pliki strony' : null,
      m.zrodla.mysql > 0 ? `- bazy danych: ${m.zrodla.mysql}` : null,
      m.zrodla.imap > 0 ? `- skrzynki pocztowe: ${m.zrodla.imap}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const termin = m.wygasa.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
    return renderEmailShell({
      title: 'Migracja czeka na Twoją zgodę',
      preheader: 'Przeniesiemy dane dopiero, gdy ją zatwierdzisz.',
      bodyMarkdown: [
        firstName ? `Dzień dobry **${escapeMarkdown(firstName)}**,` : 'Dzień dobry,',
        `nasz zespół przygotował przeniesienie **${escapeMarkdown(m.domena)}** ze starego hostingu. Przeniesiemy:`,
        co,
        'Migracja **nie wystartuje bez Twojej zgody**. W panelu zobaczysz, skąd i co przenosimy, i zatwierdzisz upoważnienie do jednorazowego dostępu do starego hostingu.',
        `Prośba jest ważna do **${termin}**. Jeśli jej nie zatwierdzisz, anulujemy migrację i usuniemy podane dane dostępowe.`,
        'Jeśli to nie Ty prosiłeś(-aś) o przeniesienie, kliknij w panelu „Nie zgadzam się”.',
      ].join('\n\n'),
      cta: { label: 'Sprawdź i zatwierdź', url: m.link },
      recipientEmail: to,
      panelUrl,
    });
  }
}
