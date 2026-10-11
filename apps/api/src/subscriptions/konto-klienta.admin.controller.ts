import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
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
import { MalwareScanService } from './malware-scan.service.js';
import { LogiHostinguQueryDto } from './dto/hosting-logs.dto.js';
import { DziennikPocztyDto } from './dto/hosting-body.dto.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { ZasobyKontaOperatoraService } from './zasoby-konta-operatora.service.js';
import { TrafieniaWafKontaService } from './trafienia-waf-konta.service.js';

type Operator = { userId: string; role: string };

export type SekcjaKonta = 'domeny' | 'dns' | 'poczta' | 'bazy' | 'php' | 'ssl' | 'cron' | 'logi' | 'logi-poczty' | 'ftp' | 'malware' | 'zasoby' | 'waf';

/** Nazwa parametru/zmiennej/flagi, której wartość jest poświadczeniem (MYSQL_PWD, DB_PASS, cron_key, api-token, --http-password…). */
const NAZWA_SEKRETU = String.raw`[\w-]*(?:pass|pwd|token|secret|key|auth)[\w-]*`;
/** Wartość: w cudzysłowie albo do spacji / separatora poleceń / następnego parametru adresu. */
const WARTOSC = String.raw`(?:'[^']*'|"[^"]*"|[^&;|\s'"]+)`;

const PRZYPISANIE = new RegExp(String.raw`((?:^|[?&;|\s'"])${NAZWA_SEKRETU}=)${WARTOSC}`, 'gi');
const FLAGA_ZE_SPACJA = new RegExp(String.raw`((?:^|\s)--${NAZWA_SEKRETU}\s+)(?!-)${WARTOSC}`, 'gi');
/** Dane logowania w adresie: scheme://user:hasło@host. */
const USERINFO = /(:\/\/[^\s/?#@:'"]+:)[^\s/?#@'"]+@/g;
/** curl -u/--user user:hasło (z cudzysłowem albo bez, także -uuser:hasło). */
const CURL_USER = /((?:^|\s)(?:-u|--user)(?:\s+|=)?)(?:'([^':]*):[^']*'|"([^":]*):[^"]*"|([^\s:'"]+):[^\s'"]+)/g;
/** Jedno wywołanie klienta MySQL — od nazwy programu do najbliższego ; & | (koniec tego polecenia). */
const WYWOLANIE_MYSQL = /\bmysql(?:dump|admin|check|import|show|slap)?\b[^;&|]*/g;
/** Sekret po dwukropku w nagłówku HTTP crona: -H/--header "Authorization: Bearer …", "X-Api-Key: …" (nazwa pasuje do NAZWA_SEKRETU — 'auth'/'key'/'token'). */
const NAGLOWEK = new RegExp(String.raw`((?:^|\s)(?:-H|--header)(?:\s+|=)['"]?${NAZWA_SEKRETU}\s*:\s*)[^'"\n]+`, 'gi');

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
    .replace(NAGLOWEK, '$1***')
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
 * Tylko odczyt (jedyny POST — wczytanie dziennika poczty — zleca węzłowi czytanie logu, nic na koncie nie zmienia),
 * te same metody co panel klienta (services.controller.ts), wołane z identyfikatorem WŁAŚCICIELA
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
    private readonly malware: MalwareScanService,
    private readonly zasobyKonta: ZasobyKontaOperatoraService,
    private readonly waf: TrafieniaWafKontaService,
  ) {}

  /**
   * Właściciel usługi z kontem hostingowym; brak usługi albo konta → 404. Audyt Fali 3 (D3) — ta sama twarda reguła co
   * akcje konta, blokady IP i poczta konta: STAFF czyta i zleca odczyty tylko na usługach klientów (USER); usługi kont
   * zespołu — tylko ADMIN (403 bez wpisu i bez zadania na węźle).
   */
  private async uslugaKonta(subscriptionId: string, actor: Operator): Promise<string> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, user: { select: { role: true } }, account: { select: { id: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!sub.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    if (actor.role !== 'ADMIN' && sub.user?.role !== 'USER') {
      throw new ForbiddenException('Personel widzi konto hostingowe wyłącznie usług klientów — usługę konta zespołu sprawdza administrator.');
    }
    return sub.userId;
  }

  /** Właściciel (uslugaKonta) + wpis w dzienniku OPERATOR_ACCOUNT_VIEWED z sekcją. */
  private async wlasciciel(
    subscriptionId: string,
    actor: Operator,
    sekcja: SekcjaKonta,
    szczegoly: Record<string, string | number | undefined> = {},
  ): Promise<string> {
    const userId = await this.uslugaKonta(subscriptionId, actor);
    await this.wpis(subscriptionId, userId, actor, sekcja, szczegoly);
    return userId;
  }

  private async wpis(subscriptionId: string, userId: string, actor: Operator, sekcja: SekcjaKonta, szczegoly: Record<string, string | number | undefined> = {}) {
    const details: Record<string, string | number> = { subscriptionId, sekcja };
    for (const [k, v] of Object.entries(szczegoly)) if (v !== undefined && v !== '') details[k] = v;
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId,
      actorUserId: actor.userId,
      details,
    });
  }

  /**
   * Lista domen konta — czytana z węzła RAZ na żądanie i przekazywana do metody sekcji, która inaczej
   * przeczytałaby ją sama drugi raz (getDomains + CMD_API_SHOW_USER_CONFIG to dwa zapytania do węzła).
   */
  private domenyKonta(id: string, userId: string): Promise<DomenyKontaHostingu> {
    return this.directAdmin.listHostingDomainsForSubscription(id, userId);
  }

  @Get('domeny')
  async domeny(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'domeny');
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
  async dns(@Param('id') id: string, @Query('domain') domain: string | undefined, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'dns', { domain });
    const domeny = await this.domenyKonta(id, userId);
    const strefa = await this.directAdmin.listHostingDnsRecords(id, userId, domain || undefined, domeny);
    return { domeny: domeny.domains.map((d) => d.name), ...strefa };
  }

  @Get('poczta')
  async poczta(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'poczta');
    const skrzynki = await this.directAdmin.listHostingEmailAccounts(id, userId);
    const przekierowania = await this.directAdmin.listHostingEmailForwarders(id, userId);
    return {
      skrzynki: skrzynki.rows.map(({ email, quotaMb }) => ({ email, quotaMb })),
      przekierowania: przekierowania.rows.map(({ email, destinations }) => ({ email, destinations })),
      fetchError: skrzynki.fetchError ?? przekierowania.fetchError,
    };
  }

  @Get('bazy')
  async bazy(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'bazy');
    const b = await this.directAdmin.listHostingMysqlForSubscription(id, userId);
    return { bazy: b.databases.map((d) => d.name), silnik: b.engine, fetchError: b.fetchError };
  }

  @Get('php')
  async phpKonta(@Param('id') id: string, @Query('domain') domain: string | undefined, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'php', { domain });
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
  async ssl(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'ssl');
    return this.directAdmin.listHostingSslCertificates(id, userId);
  }

  @Get('cron')
  async cron(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'cron');
    const c = await this.directAdmin.listHostingCronJobs(id, userId);
    return {
      rows: c.rows.map((r) => ({ id: r.id, schedule: r.schedule, command: maskujSekretyCrona(r.command) })),
      fetchError: c.fetchError,
    };
  }

  /** F2.2 — konta FTP (login i katalog; bez haseł) — do resetu hasła z paska akcji. */
  @Get('ftp')
  async ftp(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'ftp');
    const f = await this.directAdmin.listHostingFtpAccounts(id, userId);
    return { konta: f.rows.map(({ username, path }) => ({ username, path })), fetchError: f.fetchError };
  }

  /** F2.2 — wynik skanera malware (ostatnie zadanie MALWARE_SCAN, jak „Skaner” w panelu klienta). */
  @Get('malware')
  async malwareKonta(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'malware');
    return this.malware.status(id, userId);
  }

  /**
   * F2.6 — „Zasoby i diagnoza 508”: faulty limitów (24 h / 7 dni) z raportu węzła, limity konta, inody, wolne SQL
   * i błędy 5xx strony obok siebie (ostatnie odczyty — bez zlecania nowych zadań).
   */
  @Get('zasoby')
  async zasoby(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'zasoby');
    return this.zasobyKonta.widok(id, userId);
  }

  /** F2.6 — świeży odczyt wolnych SQL i statystyk strony z węzła (SLOW_SQL + SITE_STATS, tylko czytają logi). */
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:konto-zasoby' })
  @Post('zasoby')
  async odczytajZasoby(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'zasoby', { zlecenie: 'wczytanie z serwera' });
    return this.zasobyKonta.odczytaj(id, userId, actor.userId);
  }

  /**
   * F3.2 — ostatnie trafienia reguł WAF (ModSecurity) dla domen konta i tryb WAF konta (tylko odczyt; zmiana trybu —
   * ADMIN, WafAdminController). Bez treści żądań: czas, domena, adres, ścieżka bez query, reguła.
   */
  @Get('waf')
  async trafieniaWaf(@Param('id') id: string, @CurrentUser() actor: Operator) {
    // Reguła właściciela PRZED odczytem (audyt Fali 3 — wcześniej widok wychodził bez sprawdzenia, gdy trwało wczytywanie).
    const userId = await this.uslugaKonta(id, actor);
    const widok = await this.waf.widok(id, actor.role);
    // Wpis przy wydaniu trafień — nie przy każdym odpytaniu panelu w trakcie wczytywania (co 5 s).
    if (!widok.wToku) await this.wpis(id, userId, actor, 'waf');
    return widok;
  }

  /** F3.2 — świeży odczyt dziennika WAF z węzła (zadanie WAF_HITS, tylko czyta dziennik audytu). */
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:konto-waf' })
  @Post('waf')
  async wczytajTrafieniaWaf(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'waf', { zlecenie: 'wczytanie z serwera' });
    return this.waf.wczytaj(id, userId, actor.userId, actor.role);
  }

  /** Ostatnie N linii logu dostępu/błędów domeny — jak u klienta (domyślnie 200, 20–1000). */
  @Get('logi')
  async logi(@Param('id') id: string, @Query() q: LogiHostinguQueryDto, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'logi', { type: q.type, domain: q.domain, lines: q.lines });
    const domeny = await this.domenyKonta(id, userId);
    const log = await this.directAdmin.readHostingLog(id, userId, q, domeny);
    return { domeny: domeny.domains.map((d) => d.name), ...log };
  }

  /** Ostatni wczytany dziennik dostarczania poczty (bez zlecania nowego zadania na węźle — tylko odczyt). */
  @Get('logi-poczty')
  async logiPoczty(@Param('id') id: string, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'logi-poczty');
    return this.mailLog.status(id, userId);
  }

  /**
   * Świeży odczyt dziennika poczty z węzła (zadanie MAIL_LOG — tylko czyta log exima dla domen konta, niczego
   * na koncie nie zmienia), żeby obsługa nie musiała prosić klienta ani się pod niego podszywać. Domeny liczone
   * dla właściciela, zlecający w zadaniu i w dzienniku to operator. Limit jak u klienta.
   */
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:konto-mail-log' })
  @Post('logi-poczty')
  async zlecLogiPoczty(@Param('id') id: string, @Body() body: DziennikPocztyDto, @CurrentUser() actor: Operator) {
    const userId = await this.wlasciciel(id, actor, 'logi-poczty', { zlecenie: 'wczytanie z serwera', address: body.address });
    return this.mailLog.zlec(id, userId, body.address, actor.userId);
  }
}
