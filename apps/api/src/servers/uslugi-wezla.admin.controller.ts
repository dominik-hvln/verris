import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NodeTaskKind, NodeTaskStatus, Role } from '@verris/database';
import {
  KLUCZE_LOGOW_WEZLA,
  KLUCZE_USLUG_WEZLA,
  LOG_WEZLA_DOMENA,
  LOG_WEZLA_FILTR_MAX,
  LOG_WEZLA_LINIE_MAX,
  LOG_WEZLA_LINIE_MIN,
  LOG_WEZLA_UZYTKOWNIK,
  logWezla,
  logWymagaDomeny,
  maskujDlaZespolu,
  uslugaWezla,
} from '@verris/contracts';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WniosekMozliwy } from '../wnioski/wniosek-mozliwy.decorator.js';
import { parametryUslug, stanUslug, stanWatchdoga, trwa, type TrybUslug } from './uslugi-wezla.js';

export const MIN_POWOD_USLUGI = 10;

export class RestartUslugiDto {
  @IsIn(KLUCZE_USLUG_WEZLA) usluga!: string;
  @IsString() @MaxLength(500) powod!: string;
}

export class RestartUslugiWspolnejDto extends RestartUslugiDto {
  /** Nazwa węzła przepisana przez administratora (restart przerywa pracę wszystkich kont). */
  @IsString() @MaxLength(255) potwierdzenie!: string;
}

export class LogWezlaDto {
  @IsIn(KLUCZE_LOGOW_WEZLA) log!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(LOG_WEZLA_LINIE_MIN) @Max(LOG_WEZLA_LINIE_MAX) linie?: number;
  @IsOptional() @IsString() @MaxLength(LOG_WEZLA_FILTR_MAX) filtr?: string;
  @IsOptional() @IsString() @MaxLength(253) domena?: string;
  @IsOptional() @IsString() @MaxLength(64) uzytkownik?: string;
  @IsOptional() @IsISO8601({ strict: true }) od?: string;
  @IsOptional() @IsISO8601({ strict: true }) do?: string;
}

/** Filtry logu poza tekstem (14.10): domena, użytkownik, zakres czasu. */
export interface FiltryLogu {
  domena?: string;
  uzytkownik?: string;
  od?: string;
  do?: string;
}

/** Walidacja i normalizacja filtrów logu → pola zadania (since/until w sekundach epoki). */
export function parametryFiltrow(l: { plik?: string }, f: FiltryLogu = {}, zespol = false): Record<string, string> {
  const out: Record<string, string> = {};
  const domena = (f.domena ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (domena && !LOG_WEZLA_DOMENA.test(domena)) throw new BadRequestException('Domena: sama nazwa, np. firma.pl (bez http:// i ścieżki).');
  if (logWymagaDomeny(l) && !domena) throw new BadRequestException('Ten log dotyczy jednej strony — podaj domenę.');
  if (domena) out.domain = domena;
  const uz = (f.uzytkownik ?? '').trim();
  if (uz && !LOG_WEZLA_UZYTKOWNIK.test(uz)) throw new BadRequestException('Użytkownik: litery, cyfry, „_”, „.”, „-” (bez spacji).');
  // Przegląd 14.10 — zespół widzi IP zamaskowane, więc filtr nie może sprawdzać, czy dany adres jest w logu.
  if (uz && zespol && /^[0-9.:]+$/.test(uz)) throw new BadRequestException('Filtr użytkownika nie może być adresem IP.');
  if (uz) out.user = uz;
  const sek = (iso: string | undefined, pole: string) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) throw new BadRequestException(`Nieprawidłowa data (${pole}).`);
    return Math.floor(t / 1000);
  };
  const od = sek(f.od, 'od');
  const doo = sek(f.do, 'do');
  if (od !== null && doo !== null && od > doo) throw new BadRequestException('Zakres czasu: „od” jest po „do”.');
  if (od !== null) out.since = String(od);
  if (doo !== null) out.until = String(doo);
  return out;
}

interface Operator {
  userId: string;
  role: string;
}

/**
 * F3.4 — usługi i logi węzła (NOC i ADMIN) przez podpisane zadanie NODE_SERVICES (ops/scripts/node-services.sh):
 * stan usług z białej listy, restart, ogon logu z białej listy plików. Bez dowolnych komend i ścieżek.
 *
 * Restart (D2): usługa pomocnicza (panel serwera, fail2ban) — NOC z powodem. Usługa wspólna (WWW, poczta, bazy, DNS,
 * FTP) — NOC tylko ją URUCHAMIA, gdy stoi (skrypt sprawdza stan na węźle w chwili wykonania); działającą restartuje
 * ADMIN (NODE_SERVICES_RESTART_SHARED, ADMIN_ONLY) z nazwą węzła jako potwierdzeniem, zespół — wnioskiem
 * NODE_SERVICE_RESTART. Logi: adresy e-mail i IP maskowane dla STAFF (na węźle i drugi raz przy odczycie), filtry:
 * tekst, domena (także log ruchu jednej strony), użytkownik, zakres czasu.
 */
@Injectable()
export class UslugiWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Węzeł z nazwą do potwierdzenia (nazwa, a bez niej host albo IP — to, co operator widzi w nagłówku karty). */
  async wezel(serverId: string): Promise<{ id: string; name: string; status: string }> {
    const s = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, hostname: true, ipAddress: true, status: true },
    });
    if (!s) throw new NotFoundException('Nie znaleziono węzła.');
    return { id: s.id, name: s.name ?? s.hostname ?? s.ipAddress ?? s.id, status: s.status };
  }

  private zadania(serverId: string) {
    return this.prisma.nodeTask.findMany({
      where: { serverId, kind: NodeTaskKind.NODE_SERVICES },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /** Stan z zadań + watchdog z telemetrii agenta (co minutę, bez zlecania czegokolwiek na węźle). */
  async stan(serverId: string, op: Operator) {
    await this.wezel(serverId);
    const [zadania, raport] = await Promise.all([
      this.zadania(serverId),
      this.prisma.server.findUnique({ where: { id: serverId }, select: { uslugiStan: true, uslugiStanAt: true } }),
    ]);
    return {
      ...stanUslug(zadania, op.role === 'ADMIN'),
      watchdog: stanWatchdoga({ uslugiStan: raport?.uslugiStan ?? null, uslugiStanAt: raport?.uslugiStanAt ?? null }, Date.now()),
    };
  }

  /** Kolejkuje zadanie; 409, gdy na węźle trwa już zadanie tego samego trybu (restart: każdy restart). */
  private async zlec(serverId: string, op: Operator, tryb: TrybUslug, payload: Record<string, string>) {
    const s = await this.wezel(serverId);
    if (s.status !== 'ACTIVE' && s.status !== 'MAINTENANCE') throw new BadRequestException('Węzeł nie jest aktywny.');
    const wToku = (await this.zadania(serverId)).some((z) => trwa(z) && (parametryUslug(z).mode ?? 'status') === tryb);
    if (wToku) {
      throw new ConflictException(
        tryb === 'restart' ? 'Na tym węźle trwa już restart usługi — poczekaj na wynik.' : 'Poprzednie zlecenie na tym węźle jeszcze trwa — chwila.',
      );
    }
    return this.prisma.nodeTask.create({
      data: {
        serverId,
        kind: NodeTaskKind.NODE_SERVICES,
        status: NodeTaskStatus.QUEUED,
        requestedById: op.userId,
        payload: { mode: tryb, ...payload },
      },
    });
  }

  async sprawdz(serverId: string, op: Operator) {
    const t = await this.zlec(serverId, op, 'status', {});
    await this.audit.record({ action: SupportActions.NODE_SERVICES_CHECKED, actorUserId: op.userId, details: { serverId, taskId: t.id } });
    return this.stan(serverId, op);
  }

  private powod(powod: string) {
    const p = (powod ?? '').trim();
    if (p.length < MIN_POWOD_USLUGI) throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_USLUGI} znaków) — zapisze się w dzienniku.`);
    return p;
  }

  /**
   * NOC: restart usługi pomocniczej albo uruchomienie usługi wspólnej, która stoi (SVC_ONLY_DOWN — skrypt odmówi,
   * jeśli w chwili wykonania działa). Działającą usługę wspólną restartuje restartWspolnej (ADMIN albo wniosek).
   */
  async restart(serverId: string, op: Operator, usluga: string, powod: string) {
    const u = uslugaWezla(usluga);
    if (!u) throw new BadRequestException('Usługa spoza listy.');
    if (!u.restart) throw new BadRequestException('Tej usługi nie restartuje się z panelu.');
    const p = this.powod(powod);
    const t = await this.zlec(serverId, op, 'restart', { name: u.klucz, ...(u.przerwa ? { onlyDown: '1' } : {}) });
    await this.audit.record({
      action: SupportActions.NODE_SERVICE_RESTART_QUEUED,
      actorUserId: op.userId,
      details: { serverId, usluga: u.klucz, tylkoGdyStoi: u.przerwa, powod: p, taskId: t.id },
    });
    return this.stan(serverId, op);
  }

  /** Restart DZIAŁAJĄCEJ usługi wspólnej — przerwa dla wszystkich kont węzła. Wołane przez ADMIN-a i wykonawcę wniosku. */
  async restartWspolnej(serverId: string, op: Operator, usluga: string, powod: string, wniosekId?: string) {
    const u = uslugaWezla(usluga);
    if (!u?.przerwa || !u.restart) throw new BadRequestException('To nie jest usługa wspólna węzła — zrestartuj ją zwykłym restartem.');
    const p = this.powod(powod);
    const t = await this.zlec(serverId, op, 'restart', { name: u.klucz });
    await this.audit.record({
      action: SupportActions.NODE_SERVICE_RESTART_QUEUED,
      actorUserId: op.userId,
      details: { serverId, usluga: u.klucz, tylkoGdyStoi: false, powod: p, taskId: t.id, ...(wniosekId ? { wniosekId } : {}) },
    });
    return { komunikat: `Zlecono restart: ${u.etykieta}. Wynik na karcie węzła (Usługi i logi).`, taskId: t.id };
  }

  async restartWspolnejZPotwierdzeniem(serverId: string, op: Operator, usluga: string, powod: string, potwierdzenie: string) {
    const s = await this.wezel(serverId);
    if ((potwierdzenie ?? '').trim() !== s.name) {
      throw new ForbiddenException('Przepisz nazwę węzła, żeby potwierdzić restart — przerwie on pracę wszystkich kont na tym węźle.');
    }
    await this.restartWspolnej(serverId, op, usluga, powod);
    return this.stan(serverId, op);
  }

  async log(
    serverId: string,
    op: Operator,
    klucz: string,
    linie: number | undefined,
    filtr: string | undefined,
    filtry: FiltryLogu = {},
  ) {
    const l = logWezla(klucz);
    if (!l) throw new BadRequestException('Log spoza listy.');
    const f = (filtr ?? '').trim();
    if (/[\x00-\x1f\x7f]/.test(f)) throw new BadRequestException('Filtr: sam tekst, bez znaków sterujących.');
    const dodatkowe = parametryFiltrow(l, filtry, op.role !== 'ADMIN');
    const n = linie ?? 200;
    // Maska adresów e-mail i IP dla STAFF (decyzja 14.10: we wszystkich logach) ustawiana tutaj, nie z formularza.
    const maska = op.role === 'ADMIN' ? '0' : '1';
    const t = await this.zlec(serverId, op, 'log', { name: l.klucz, lines: String(n), ...(f ? { filter: f } : {}), ...dodatkowe, mask: maska });
    await this.audit.record({
      action: SupportActions.NODE_LOG_VIEWED,
      actorUserId: op.userId,
      details: {
        serverId,
        log: l.klucz,
        linie: n,
        // Dziennik audytu czyta też zespół — filtr ADMIN-a (np. pełny adres albo IP) zapisany z maską.
        filtr: f ? maskujDlaZespolu(f) : null,
        domena: dodatkowe.domain ?? null,
        uzytkownik: dodatkowe.user ? maskujDlaZespolu(dodatkowe.user) : null,
        od: dodatkowe.since ? new Date(Number(dodatkowe.since) * 1000).toISOString() : null,
        do: dodatkowe.until ? new Date(Number(dodatkowe.until) * 1000).toISOString() : null,
        maska: maska === '1',
        taskId: t.id,
      },
    });
    return this.stan(serverId, op);
  }
}

@Controller('admin/servers/:id/uslugi')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('NODE_SERVICES')
export class UslugiWezlaAdminController {
  constructor(private readonly uslugi: UslugiWezlaService) {}

  @Get()
  stan(@Param('id') id: string, @CurrentUser() op: Operator) {
    return this.uslugi.stan(id, op);
  }

  @Post('sprawdz')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-uslugi' })
  sprawdz(@Param('id') id: string, @CurrentUser() op: Operator) {
    return this.uslugi.sprawdz(id, op);
  }

  @Post('restart')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-uslugi-restart' })
  restart(@Param('id') id: string, @Body() b: RestartUslugiDto, @CurrentUser() op: Operator) {
    return this.uslugi.restart(id, op, b.usluga, b.powod);
  }

  @Post('restart-wspolnej')
  @HttpCode(200)
  @StaffPerm('NODE_SERVICES', 'NODE_SERVICES_RESTART_SHARED')
  @WniosekMozliwy('NODE_SERVICE_RESTART')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-uslugi-restart' })
  restartWspolnej(@Param('id') id: string, @Body() b: RestartUslugiWspolnejDto, @CurrentUser() op: Operator) {
    return this.uslugi.restartWspolnejZPotwierdzeniem(id, op, b.usluga, b.powod, b.potwierdzenie);
  }

  @Post('log')
  @HttpCode(200)
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-logi' })
  log(@Param('id') id: string, @Body() b: LogWezlaDto, @CurrentUser() op: Operator) {
    return this.uslugi.log(id, op, b.log, b.linie, b.filtr, { domena: b.domena, uzytkownik: b.uzytkownik, od: b.od, do: b.do });
  }
}
