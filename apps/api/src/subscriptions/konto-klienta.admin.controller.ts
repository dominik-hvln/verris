import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { hostingFetchErrorMessage } from '@verris/contracts';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService, type DomenyKontaHostingu } from '../servers/directadmin.service.js';
import { PhpService } from './php.service.js';
import { MailLogService } from './mail-log.service.js';
import { LogiHostinguQueryDto } from './dto/hosting-logs.dto.js';

export type SekcjaKonta = 'domeny' | 'dns' | 'poczta' | 'bazy' | 'php' | 'ssl' | 'cron' | 'logi' | 'logi-poczty';

/** Nazwa parametru/zmiennej/flagi, której wartość jest poświadczeniem (MYSQL_PWD, DB_PASS, cron_key, api-token, --http-password…). */
const NAZWA_SEKRETU = String.raw`[\w-]*(?:pass|pwd|token|secret|key|auth)[\w-]*`;
/** Wartość: w cudzysłowie albo do spacji / separatora poleceń / następnego parametru adresu. */
const WARTOSC = String.raw`(?:'[^']*'|"[^"]*"|[^&;|\s'"]+)`;

const PRZYPISANIE = new RegExp(String.raw`((?:^|[?&;|\s])${NAZWA_SEKRETU}=)${WARTOSC}`, 'gi');
const FLAGA_ZE_SPACJA = new RegExp(String.raw`((?:^|\s)--${NAZWA_SEKRETU}\s+)(?!-)${WARTOSC}`, 'gi');
/** Dane logowania w adresie: scheme://user:hasło@host. */
const USERINFO = /(:\/\/[^\s/?#@:'"]+:)[^\s/?#@'"]+@/g;
/** curl -u/--user user:hasło (z cudzysłowem albo bez, także -uuser:hasło). */
const CURL_USER = /((?:^|\s)(?:-u|--user)(?:\s+|=)?)(?:'([^':]*):[^']*'|"([^":]*):[^"]*"|([^\s:'"]+):[^\s'"]+)/g;
/** Jedno wywołanie klienta MySQL — od nazwy programu do najbliższego ; & | (koniec tego polecenia). */
const WYWOLANIE_MYSQL = /\bmysql(?:dump|admin|check|import|show|slap)?\b[^;&|]*/g;

/**
 * Sekrety w poleceniach crona (hasło do bazy, token w adresie, dane logowania) — operator widzi polecenie,
 * ale nie poświadczenia. `-pHASLO` maskujemy tylko jako argument tego samego wywołania mysql/mysqldump
 * (gdzie indziej `-p…` to zwykle inna flaga, np. `cp -pr`, `mkdir -p`).
 */
export function maskujSekretyCrona(polecenie: string): string {
  return polecenie
    .replace(WYWOLANIE_MYSQL, (wywolanie) => wywolanie.replace(/(\s-p)(?!\s)(?:'[^']*'|"[^"]*"|\S+)/g, '$1***'))
    .replace(PRZYPISANIE, '$1***')
    .replace(FLAGA_ZE_SPACJA, '$1***')
    .replace(USERINFO, '$1***@')
    .replace(CURL_USER, (_c, flaga: string, wPojedynczym?: string, wPodwojnym?: string, bez?: string) =>
      wPojedynczym !== undefined
        ? `${flaga}'${wPojedynczym}:***'`
        : wPodwojnym !== undefined
          ? `${flaga}"${wPodwojnym}:***"`
          : `${flaga}${bez}:***`,
    );
}

/**
 * PB-42 (decyzja właściciela 08.10) — obsługa widzi konto klienta bez wchodzenia na serwer i bez impersonacji.
 * Tylko odczyt, te same metody co panel klienta (services.controller.ts), wołane z identyfikatorem WŁAŚCICIELA
 * usługi — nigdy operatora. Każdy odczyt (także nieudany na węźle) trafia do dziennika jako OPERATOR_ACCOUNT_VIEWED
 * z sekcją; klient tego wpisu nie widzi w „Aktywności konta” (nie jest HOSTING_*). Zasoby i kopie są w
 * subscriptions.admin.controller.ts (usage, hosting-backups).
 */
@Controller('admin/subscriptions/:id/konto')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('ACCOUNT_DIAGNOSTICS_VIEW')
export class KontoKlientaAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly php: PhpService,
    private readonly mailLog: MailLogService,
    private readonly audit: AuditService,
  ) {}

  /** Właściciel usługi z kontem hostingowym + wpis w dzienniku; brak usługi albo konta → 404 bez wpisu. */
  private async wlasciciel(
    subscriptionId: string,
    actorUserId: string,
    sekcja: SekcjaKonta,
    szczegoly: Record<string, string | number | undefined> = {},
  ): Promise<string> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, account: { select: { id: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!sub.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    const details: Record<string, string | number> = { subscriptionId, sekcja };
    for (const [k, v] of Object.entries(szczegoly)) if (v !== undefined && v !== '') details[k] = v;
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId: sub.userId,
      actorUserId,
      details,
    });
    return sub.userId;
  }

  /**
   * Lista domen konta — czytana z węzła RAZ na żądanie i przekazywana do metody sekcji, która inaczej
   * przeczytałaby ją sama drugi raz (getDomains + CMD_API_SHOW_USER_CONFIG to dwa zapytania do węzła).
   */
  private domenyKonta(id: string, userId: string): Promise<DomenyKontaHostingu> {
    return this.directAdmin.listHostingDomainsForSubscription(id, userId);
  }

  @Get('domeny')
  async domeny(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'domeny');
    const domeny = await this.domenyKonta(id, userId);
    const poddomeny = await this.directAdmin.listHostingSubdomains(id, userId, domeny);
    return {
      domeny: domeny.domains.map((d) => d.name),
      glowna: domeny.primaryDomain,
      poddomeny: poddomeny.rows.map(({ subdomain, domain }) => ({ subdomain, domain })),
      fetchError: domeny.fetchError ?? poddomeny.fetchError,
    };
  }

  @Get('dns')
  async dns(@Param('id') id: string, @Query('domain') domain: string | undefined, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'dns', { domain });
    const domeny = await this.domenyKonta(id, userId);
    const strefa = await this.directAdmin.listHostingDnsRecords(id, userId, domain || undefined, domeny);
    return { domeny: domeny.domains.map((d) => d.name), ...strefa };
  }

  @Get('poczta')
  async poczta(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'poczta');
    const skrzynki = await this.directAdmin.listHostingEmailAccounts(id, userId);
    const przekierowania = await this.directAdmin.listHostingEmailForwarders(id, userId);
    return {
      skrzynki: skrzynki.rows.map(({ email, quotaMb }) => ({ email, quotaMb })),
      przekierowania: przekierowania.rows.map(({ email, destinations }) => ({ email, destinations })),
      fetchError: skrzynki.fetchError ?? przekierowania.fetchError,
    };
  }

  @Get('bazy')
  async bazy(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'bazy');
    const b = await this.directAdmin.listHostingMysqlForSubscription(id, userId);
    return { bazy: b.databases.map((d) => d.name), silnik: b.engine, fetchError: b.fetchError };
  }

  @Get('php')
  async phpKonta(@Param('id') id: string, @Query('domain') domain: string | undefined, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'php', { domain });
    const [stan, domeny] = await Promise.all([this.php.statusForSubscription(id, userId), this.domenyKonta(id, userId)]);
    const cel = domain || stan.domain;
    // Odczyt .user.ini domeny z węzła — awaria to komunikat w sekcji, nie błąd całej karty.
    let ini: { domain: string; values: Record<string, string>; wlasneDyrektywy: number } | null = null;
    let iniBlad: string | null = null;
    try {
      ini = await this.directAdmin.getHostingPhpIni(id, userId, cel, domeny);
    } catch (err) {
      iniBlad = hostingFetchErrorMessage(err instanceof Error ? err.message : String(err));
    }
    return {
      wersja: stan.version,
      dostepneWersje: stan.availableVersions,
      zastosowano: stan.appliedAt,
      ostatnieZadanie: stan.lastTask,
      domeny: domeny.domains.map((d) => d.name),
      domena: cel,
      ini: ini?.values ?? null,
      wlasneDyrektywy: ini?.wlasneDyrektywy ?? null,
      iniBlad,
    };
  }

  @Get('ssl')
  async ssl(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'ssl');
    return this.directAdmin.listHostingSslCertificates(id, userId);
  }

  @Get('cron')
  async cron(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'cron');
    const c = await this.directAdmin.listHostingCronJobs(id, userId);
    return {
      rows: c.rows.map((r) => ({ id: r.id, schedule: r.schedule, command: maskujSekretyCrona(r.command) })),
      fetchError: c.fetchError,
    };
  }

  /** Ostatnie N linii logu dostępu/błędów domeny — jak u klienta (domyślnie 200, 20–1000). */
  @Get('logi')
  async logi(@Param('id') id: string, @Query() q: LogiHostinguQueryDto, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'logi', { type: q.type, domain: q.domain, lines: q.lines });
    const domeny = await this.domenyKonta(id, userId);
    const log = await this.directAdmin.readHostingLog(id, userId, q, domeny);
    return { domeny: domeny.domains.map((d) => d.name), ...log };
  }

  /** Ostatni wczytany dziennik dostarczania poczty (bez zlecania nowego zadania na węźle — tylko odczyt). */
  @Get('logi-poczty')
  async logiPoczty(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'logi-poczty');
    return this.mailLog.status(id, userId);
  }
}
