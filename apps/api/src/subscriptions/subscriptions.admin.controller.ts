import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm, StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import {
  SubscriptionsService,
  SuspendReason,
} from './subscriptions.service.js';
import { MigrationOrchestratorService } from './migration-orchestrator.service.js';
import { PlanChangeService } from './plan-change.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { HostingRestoreService } from './hosting-restore.service.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { HostingRestoreDto, ListaNaWezleDto, OdtworzNaWezleDto } from './dto/hosting-restore.dto.js';
import { OdtworzenieNaWezleService } from './odtworzenie-na-wezle.service.js';
import {
  SuspendSubscriptionDto,
  UnsuspendSubscriptionDto,
  ZakonczIUsunDto,
} from './dto/subscription.dto.js';
import { RetencjaKontService } from './retencja-kont.service.js';
import { POWODY_ZAWIESZENIA_OPERATORA, ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';
import { WniosekMozliwy } from '../wnioski/wniosek-mozliwy.decorator.js';
import { uprawnieniaOperatora } from '../staff-roles/uprawnienia-operatora.js';
import { rowsToCsv } from '../billing/csv.util.js';
import { filtryDoDziennika, ListaUslugQuery, stronaListy, USLUGI_MAX_EKSPORT, warunkiListyUslug } from './lista-uslug.js';
import { RequestInternalMigrationDto } from './dto/migration.dto.js';
import { opisLimitow } from './limity-indywidualne.js';
import { planResourceFields } from '../servers/da-package-spec.js';
import { domenaDoWyswietlenia } from '@verris/contracts';
import {
  AdminChangePlanDto,
  AdminPreviewPlanChangeDto,
} from './dto/admin-plan-change.dto.js';

const WIERSZ_USLUGI = {
  plan: { select: { slug: true, name: true } },
  user: { select: { email: true, firstName: true, lastName: true } },
  account: { select: { id: true, daUsername: true, domain: true, status: true, serverId: true } },
} as const;
const WIERSZ_USLUGI_CSV = {
  plan: { select: { name: true } },
  user: { select: { email: true } },
  account: { select: { daUsername: true, domain: true, server: { select: { name: true } } } },
} as const;

const ALLOWED_REASONS: SuspendReason[] = [
  'PAYMENT_FAILED',
  'GRACE_EXPIRED',
  'ABUSE',
  'MANUAL_ADMIN',
  'CUSTOMER_REQUEST',
];

/**
 * PB-44 — odtworzenie z kopii i migracja wewnętrzna zlecone przez pracownika obsługi wymagają powodu
 * (trafia do dziennika). Admin może go pominąć (jego panel nie ma tego pola).
 */
function wymagajPowoduOdStaff(actor: { role?: string }, powod: string | undefined): void {
  if (actor.role === Role.STAFF && (powod ?? '').trim().length < 10) {
    throw new BadRequestException('Podaj powód operacji (min. 10 znaków) — zapisze się w dzienniku.');
  }
}

/**
 * L1-KARTA (decyzja 08.10) — karta usługi w panelu obsługi otwiera się każdemu, kto widzi klientów (L1 Konsultant:
 * CUSTOMERS_VIEW) albo zarządza usługami (np. NOC: SUBSCRIPTIONS_MANAGE bez CUSTOMERS_VIEW). Odczyty karty mają
 * na metodzie @StaffPermAny (zastępuje @StaffPerm klasy); odczyty z węzła — za uprawnieniem do podglądu konta,
 * a wszystkie zapisy i lista planów do zmiany zostają za SUBSCRIPTIONS_MANAGE z klasy.
 */
const ODCZYT_KARTY = ['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE'] as const;

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN)
@StaffPerm('SUBSCRIPTIONS_MANAGE')
export class SubscriptionsAdminController {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly prisma: PrismaService,
    private readonly migrations: MigrationOrchestratorService,
    private readonly planChange: PlanChangeService,
    private readonly hostingRestore: HostingRestoreService,
    private readonly diagnostics: DiagnosticsService,
    private readonly directAdmin: DirectAdminService,
    private readonly naWezle: OdtworzenieNaWezleService,
    private readonly retencja: RetencjaKontService,
    private readonly audit: AuditService,
    private readonly zawieszenie: ZawieszenieOperatoraService,
  ) {}

  /**
   * Przegląd poprawek Fali 3 (D3) — ta sama twarda reguła co karta konta (konto-klienta.admin.controller.ts), akcje
   * konta i zawieszenie: STAFF czyta konto z węzła i zmienia je tylko na usługach klientów (USER); usługi kont zespołu —
   * tylko ADMIN. 403 przed wpisem w dzienniku i przed węzłem.
   */
  private async uslugaKlienta(id: string, actor: { role?: string }): Promise<{ userId: string }> {
    const sub = await this.prisma.subscription.findUnique({ where: { id }, select: { userId: true, user: { select: { role: true } } } });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (actor.role !== Role.ADMIN && sub.user?.role !== Role.USER) {
      throw new ForbiddenException('Personel obsługuje wyłącznie usługi klientów — usługę konta zespołu obsługuje administrator.');
    }
    return { userId: sub.userId };
  }

  // H-16 — odtworzenie konta z kopii off-site na innym węźle (utrata węzła). Tylko ADMIN: przepina konto.
  @Get(':id/odtworzenie-na-wezle')
  odtworzenieNaWezle(@Param('id') id: string) {
    return this.naWezle.status(id);
  }

  @Post(':id/odtworzenie-na-wezle/lista')
  odtworzenieNaWezleLista(@Param('id') id: string, @Body() body: ListaNaWezleDto, @CurrentUser() actor: { userId: string }) {
    return this.naWezle.lista(id, actor.userId, body);
  }

  @Post(':id/odtworzenie-na-wezle')
  odtworzenieNaWezleStart(@Param('id') id: string, @Body() body: OdtworzNaWezleDto, @CurrentUser() actor: { userId: string }) {
    return this.naWezle.start(id, actor.userId, body);
  }

  /**
   * H-18 — lista kopii konta dla operatora (wybór kopii do odtworzenia). Odczyt konta klienta z węzła, więc
   * w dzienniku jak sekcje podglądu konta (PB-42, konto-klienta.admin.controller.ts) — od PB-44 czyta ją też obsługa.
   */
  @Get(':id/hosting-backups')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny('SUBSCRIPTIONS_MANAGE', 'ACCOUNT_DIAGNOSTICS_VIEW')
  async hostingBackups(@Param('id') id: string, @CurrentUser() actor: { userId: string; role?: string }) {
    const sub = await this.uslugaKlienta(id, actor);
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId: sub.userId,
      actorUserId: actor.userId,
      details: { subscriptionId: id, sekcja: 'kopie' },
    });
    // Weryfikacja 11.10 — data i rozmiar przy każdej kopii („Kopia do odtworzenia” — która wersja).
    return this.directAdmin.listHostingBackups(id, sub.userId, { metadane: true });
  }

  /**
   * ADM-2 — Centrum diagnostyki: jedno wywołanie składa pełen obraz usługi. Od L1-KARTA także za TICKETS_MANAGE,
   * jak diagnostyka z rozmowy (PB-43, zgloszenie-diagnostyka.controller.ts) — konsultant uruchamia ją z karty.
   * Odpytuje węzeł, więc w dzienniku jak pozostałe odczyty konta (OPERATOR_ACCOUNT_VIEWED, klient = właściciel).
   */
  @Get(':id/diagnostics')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny('SUBSCRIPTIONS_MANAGE', 'ACCOUNT_DIAGNOSTICS_VIEW', 'TICKETS_MANAGE')
  async runDiagnostics(@Param('id') id: string, @CurrentUser() actor: { userId: string; role?: string }) {
    const sub = await this.uslugaKlienta(id, actor);
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId: sub.userId,
      actorUserId: actor.userId,
      details: { subscriptionId: id, sekcja: 'diagnostyka' },
    });
    return this.diagnostics.forSubscription(id);
  }

  /** Admin-initiated restore (no domain confirmation required; full audit trail). */
  @Post(':id/hosting-restore')
  @Roles(Role.ADMIN, Role.STAFF)
  async runHostingRestore(
    @Param('id') id: string,
    @Body() dto: HostingRestoreDto,
    @CurrentUser() actor: { userId: string; role?: string },
  ) {
    wymagajPowoduOdStaff(actor, dto.reason);
    await this.uslugaKlienta(id, actor);
    return this.hostingRestore.enqueue(id, actor.userId, {
      backupId: dto.backupId,
      scopeFiles: dto.scopeFiles,
      scopeDatabases: dto.scopeDatabases,
      scopeEmail: dto.scopeEmail,
      safetyBackup: dto.safetyBackup,
      isAdmin: true,
      reason: dto.reason,
    });
  }

  @Get(':id/hosting-restore/status')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny(...ODCZYT_KARTY)
  hostingRestoreStatus(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.hostingRestore.latestForSubscription(id, actor.userId, true);
  }

  /**
   * F2.4 — lista usług: filtry (stan, w tym PAST_DUE, węzeł, plan, klient, wyszukiwanie) i stronicowanie w API;
   * wcześniej cichy limit 200 najnowszych. `liczby` — ile usług w każdym stanie przy pozostałych filtrach (zakładki).
   * Weryfikacja 11.10 — lista w trybie odczytu z tym samym uprawnieniem co karta (ODCZYT_KARTY: L1 ma CUSTOMERS_VIEW);
   * wcześniej SUBSCRIPTIONS_MANAGE z klasy, więc L1 otwierał kartę usługi, a listy nie. Eksport CSV bez zmian.
   */
  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny(...ODCZYT_KARTY)
  async list(@Query() q: ListaUslugQuery) {
    const where = warunkiListyUslug(q);
    const { limit, page, skip } = stronaListy(q);
    const [total, rows, grupy] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: WIERSZ_USLUGI,
        take: limit,
        skip,
      }),
      this.prisma.subscription.groupBy({ by: ['status'], where: warunkiListyUslug(q, { bezStatusu: true }), _count: { _all: true } }),
    ]);
    return {
      rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      liczby: Object.fromEntries(grupy.map((g) => [g.status, g._count._all])),
    };
  }

  /**
   * F2.4 — eksport listy usług do CSV (te same filtry co lista). Dane osobowe (e-mail klienta), więc osobne
   * uprawnienie EXPORT_DATA (L4; obok uprawnienia do samej listy) i wpis w dzienniku z filtrami i liczbą wierszy. Przed `:id`, inaczej Nest
   * potraktowałby „export.csv” jak id usługi.
   */
  @Get('export.csv')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('SUBSCRIPTIONS_MANAGE', 'EXPORT_DATA')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query() q: ListaUslugQuery, @CurrentUser() actor: { userId: string }, @Res() res: Response) {
    const where = warunkiListyUslug(q);
    const total = await this.prisma.subscription.count({ where });
    if (total > USLUGI_MAX_EKSPORT) {
      throw new BadRequestException(`Za dużo usług do eksportu (${total}). Zawęź filtry do ${USLUGI_MAX_EKSPORT}.`);
    }
    const rows = await this.prisma.subscription.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: WIERSZ_USLUGI_CSV });
    await this.audit.record({
      action: SupportActions.OPERATOR_LIST_EXPORTED,
      userId: null,
      actorUserId: actor.userId,
      details: { lista: 'uslugi', filtry: filtryDoDziennika(q), wierszy: rows.length },
    });
    const csv = rowsToCsv(rows, [
      { header: 'id', value: (r) => r.id },
      { header: 'usluga', value: (r) => r.serviceTag ?? r.account?.daUsername ?? null },
      // Weryfikacja 12.10 — domena usuniętego konta czytelna („x.pl (usunięta)”), id usługi w kolumnie `id` bez zmian.
      { header: 'domena', value: (r) => domenaDoWyswietlenia(r.account?.domain) ?? null },
      { header: 'plan', value: (r) => r.plan.name },
      { header: 'stan', value: (r) => r.status },
      { header: 'cena', value: (r) => (r.individualPrice ?? r.priceAmount).toString() },
      { header: 'waluta', value: (r) => r.currency },
      { header: 'okres', value: (r) => r.interval },
      { header: 'koniec_okresu', value: (r) => r.currentPeriodEnd?.toISOString() ?? null },
      { header: 'klient_id', value: (r) => r.userId },
      { header: 'klient_email', value: (r) => r.user.email },
      { header: 'wezel', value: (r) => r.account?.server?.name ?? null },
      { header: 'zalozona', value: (r) => r.createdAt.toISOString() },
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="verris-uslugi-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny(...ODCZYT_KARTY)
  async detail(@Param('id') id: string) {
    const s = await this.prisma.subscription.findUniqueOrThrow({
      where: { id },
      include: {
        plan: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        account: { include: { server: { select: { id: true, name: true, region: true, hostname: true } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    // K3 — sekcja „Limity indywidualne”: plan, nadpisanie i limit obowiązujący dla każdego pola.
    return { ...s, limity: opisLimitow(planResourceFields(s.plan), s.limitOverrides) };
  }

  /** Per-service resource usage drill-down for ops (CPU/RAM/disk/IO buckets + effective LVE limits). */
  @Get(':id/usage')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny(...ODCZYT_KARTY)
  async usage(@Param('id') id: string, @Query('window') window = '24h') {
    const hours = window === '7d' ? 24 * 7 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [rowsDesc, account] = await Promise.all([
      this.prisma.usageMetric.findMany({
        where: { subscriptionId: id, bucketStart: { gte: since } },
        orderBy: { bucketStart: 'desc' },
        take: window === '7d' ? 500 : 1440,
      }),
      this.prisma.account.findUnique({
        where: { subscriptionId: id },
        select: {
          daUsername: true,
          domain: true,
          status: true,
          serverId: true,
          cpuLimit: true,
          ramLimitMb: true,
          diskLimitMb: true,
          ioLimitKbps: true,
          iopsLimit: true,
          entryProcesses: true,
          nprocLimit: true,
          scaledCpu: true,
          scaledRamMb: true,
          scaledDiskMb: true,
        },
      }),
    ]);
    const rows = rowsDesc.reverse();
    const latest = rows.at(-1) ?? null;
    return {
      window,
      account,
      latest: latest
        ? {
            bucketStart: latest.bucketStart.toISOString(),
            cpuUsageAvg: latest.cpuUsageAvg,
            cpuUsageMax: latest.cpuUsageMax,
            memUsageAvgMb: latest.memUsageAvgMb,
            memUsageMaxMb: latest.memUsageMaxMb,
            diskUsageMb: latest.diskUsageMb,
            ioUsageKbps: latest.ioUsageKbps,
          }
        : null,
      rows: rows.map((row) => ({
        bucketStart: row.bucketStart.toISOString(),
        bucketDurationS: row.bucketDurationS,
        cpuUsageAvg: row.cpuUsageAvg,
        cpuUsageMax: row.cpuUsageMax,
        memUsageAvgMb: row.memUsageAvgMb,
        memUsageMaxMb: row.memUsageMaxMb,
        diskUsageMb: row.diskUsageMb,
        ioUsageKbps: row.ioUsageKbps,
      })),
    };
  }

  /**
   * F2.3 (D2, 10.10) — zawieszenie odcina stronę, pocztę i FTP klienta, ale jest odwracalne: pracownik z
   * SUBSCRIPTIONS_SUSPEND (L3, zespół abuse) wykonuje je sam z powodem (min. 10 znaków) i — gdy jest — numerem
   * zgłoszenia; niżej 403 WYMAGA_WNIOSKU i wniosek SUBSCRIPTION_SUSPEND. Zawieszenie „za brak płatności”
   * (mail o zaległości, wygaśnięcie po 14 dniach) zostaje dla administratora.
   */
  @Post(':id/suspend')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('SUBSCRIPTIONS_SUSPEND')
  @WniosekMozliwy('SUBSCRIPTION_SUSPEND')
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendSubscriptionDto,
    @CurrentUser() actor: { userId: string; role?: string },
  ) {
    let reason: SuspendReason;
    if (actor.role === Role.STAFF) {
      if (!(POWODY_ZAWIESZENIA_OPERATORA as readonly string[]).includes(dto.reason)) {
        throw new BadRequestException('Zawieszenie za brak płatności ustawia administrator — wybierz nadużycie, decyzję obsługi albo prośbę klienta.');
      }
      wymagajPowoduOdStaff(actor, dto.note);
      reason = dto.reason as SuspendReason;
    } else {
      reason = ALLOWED_REASONS.includes(dto.reason as SuspendReason) ? (dto.reason as SuspendReason) : 'MANUAL_ADMIN';
    }
    return this.zawieszenie.zawies({ subscriptionId: id, aktorUserId: actor.userId, aktorRola: actor.role, reason, powod: dto.note, zgloszenie: dto.zgloszenie });
  }

  /**
   * F2.3 — odwieszenie: jak zawieszenie (SUBSCRIPTIONS_SUSPEND albo wniosek SUBSCRIPTION_UNSUSPEND). Obciążenie
   * portfela klienta za odnowienie to operacja finansowa — pracownik potrzebuje do niej także BILLING_MANAGE (L4).
   */
  @Post(':id/unsuspend')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('SUBSCRIPTIONS_SUSPEND')
  @WniosekMozliwy('SUBSCRIPTION_UNSUSPEND')
  async unsuspend(
    @Param('id') id: string,
    @Body() dto: UnsuspendSubscriptionDto,
    @CurrentUser() actor: { userId: string; role?: string; principalUserId?: string },
  ) {
    if (actor.role === Role.STAFF) {
      wymagajPowoduOdStaff(actor, dto.note);
      if (dto.chargeRenewal && !(await uprawnieniaOperatora(this.prisma, actor.principalUserId ?? actor.userId)).includes('BILLING_MANAGE')) {
        throw new ForbiddenException('Obciążenie klienta za odnowienie wymaga uprawnienia do rozliczeń (BILLING_MANAGE). Odwieś bez obciążenia.');
      }
    }
    return this.zawieszenie.odwies({
      subscriptionId: id,
      aktorUserId: actor.userId,
      aktorRola: actor.role,
      powod: dto.note,
      zgloszenie: dto.zgloszenie,
      chargeRenewal: dto.chargeRenewal,
    });
  }

  /**
   * Zakończenie usługi i natychmiastowe usunięcie konta hostingowego — nieodwracalne, więc tylko ADMIN
   * (bez nadpisania ról), z powodem do audytu i potwierdzeniem domeną. Retencja 14 dni tu nie obowiązuje.
   */
  @Post(':id/zakoncz-i-usun')
  @HttpCode(200)
  zakonczIUsun(
    @Param('id') id: string,
    @Body() dto: ZakonczIUsunDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.retencja.zakonczIUsunTeraz(id, dto, actor.userId);
  }

  /** G‑7: zlecenie migracji wewnętrznej między węzłami przez admin/staff. */
  @Post(':id/internal-migration')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  async requestInternalMigration(
    @Param('id') id: string,
    @Body() dto: RequestInternalMigrationDto,
    @CurrentUser() actor: { userId: string; role?: string },
  ) {
    wymagajPowoduOdStaff(actor, dto.notes);
    await this.uslugaKlienta(id, actor);
    return this.migrations.requestInternalMigrationByAdmin(id, actor.userId, dto);
  }

  @Get(':id/migrations')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPermAny(...ODCZYT_KARTY)
  migrationTimeline(@Param('id') id: string) {
    return this.migrations.listMigrationTimelineForAdmin(id);
  }

  @Get(':id/plan/eligible-plans')
  @Roles(Role.ADMIN, Role.STAFF)
  listEligiblePlans(@Param('id') id: string) {
    return this.planChange.listEligiblePlansForAdmin(id);
  }

  @Post(':id/plan/preview')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  previewPlanChange(@Param('id') id: string, @Body() dto: AdminPreviewPlanChangeDto) {
    return this.planChange.previewForAdmin(id, dto.targetPlanId, dto.targetInterval);
  }

  @Post(':id/plan')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  async changePlan(
    @Param('id') id: string,
    @Body() dto: AdminChangePlanDto,
    @CurrentUser() actor: { userId: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { role: true },
    });
    if (!user) throw new BadRequestException('Nie znaleziono operatora.');
    await this.uslugaKlienta(id, user);
    return this.planChange.changeForAdmin(
      actor.userId,
      user.role,
      id,
      dto.targetPlanId,
      dto.reason,
      dto.skipBilling ?? false,
      dto.targetInterval,
    );
  }
}
