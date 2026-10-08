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
import { DirectAdminService } from '../servers/directadmin.service.js';
import { PhpService } from './php.service.js';
import { MailLogService } from './mail-log.service.js';
import { LogiHostinguQueryDto } from './dto/hosting-logs.dto.js';

export type SekcjaKonta = 'domeny' | 'dns' | 'poczta' | 'bazy' | 'php' | 'ssl' | 'cron' | 'logi' | 'logi-poczty';

/**
 * Sekrety w poleceniach crona (hasło do bazy, token w adresie) — operator widzi polecenie, ale nie poświadczenia.
 * `-pHASLO` maskujemy tylko przy mysql/mysqldump (gdzie indziej `-p…` to zwykle inna flaga).
 */
export function maskujSekretyCrona(polecenie: string): string {
  let out = polecenie
    .replace(/([?&;\s](?:password|passwd|pass|pwd|token|key|secret|apikey|api_key|auth)=)[^&\s'"]+/gi, '$1***')
    .replace(/(--(?:password|pass|token|secret|key)[= ])(?:'[^']*'|"[^"]*"|\S+)/gi, '$1***');
  if (/\bmysql(?:dump)?\b/.test(out)) out = out.replace(/(\s-p)(?!\s)(?:'[^']*'|"[^"]*"|\S+)/g, '$1***');
  return out;
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

  private async nazwyDomen(id: string, userId: string): Promise<string[]> {
    const d = await this.directAdmin.listHostingDomainsForSubscription(id, userId);
    return d.domains.map((x) => x.name);
  }

  @Get('domeny')
  async domeny(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'domeny');
    const domeny = await this.directAdmin.listHostingDomainsForSubscription(id, userId);
    const poddomeny = await this.directAdmin.listHostingSubdomains(id, userId);
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
    const domeny = await this.nazwyDomen(id, userId);
    const strefa = await this.directAdmin.listHostingDnsRecords(id, userId, domain || undefined);
    return { domeny, ...strefa };
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
    const stan = await this.php.statusForSubscription(id, userId);
    const domeny = await this.nazwyDomen(id, userId);
    const cel = domain || stan.domain;
    // Odczyt .user.ini domeny z węzła — awaria to komunikat w sekcji, nie błąd całej karty.
    let ini: { domain: string; values: Record<string, string>; wlasneDyrektywy: number } | null = null;
    let iniBlad: string | null = null;
    try {
      ini = await this.directAdmin.getHostingPhpIni(id, userId, cel);
    } catch (err) {
      iniBlad = hostingFetchErrorMessage(err instanceof Error ? err.message : String(err));
    }
    return {
      wersja: stan.version,
      dostepneWersje: stan.availableVersions,
      zastosowano: stan.appliedAt,
      ostatnieZadanie: stan.lastTask,
      domeny,
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
    const domeny = await this.nazwyDomen(id, userId);
    const log = await this.directAdmin.readHostingLog(id, userId, q);
    return { domeny, ...log };
  }

  /** Ostatni wczytany dziennik dostarczania poczty (bez zlecania nowego zadania na węźle — tylko odczyt). */
  @Get('logi-poczty')
  async logiPoczty(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    const userId = await this.wlasciciel(id, actor.userId, 'logi-poczty');
    return this.mailLog.status(id, userId);
  }
}
