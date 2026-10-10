import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hostingFetchErrorMessage } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { faultyKonta } from '../telemetry/faulty-lve.js';
import { SlowSqlService } from './slow-sql.service.js';
import { SiteStatsService } from './site-stats.service.js';

/**
 * F2.6 — „Zasoby i diagnoza 508” na karcie usługi (operator, ACCOUNT_DIAGNOSTICS_VIEW): faulty limitów konta z raportu
 * węzła (24 h i 7 dni, telemetry/faulty-lve.ts), limity konta, inody (DirectAdmin CMD_API_SHOW_USER_USAGE/CONFIG —
 * istniejące getConnectionInfo), wolne zapytania SQL (SLOW_SQL) i błędy 5xx strony (SITE_STATS) obok siebie.
 * Odczyt z węzła zleca operator (`odczytaj`), ale te same zadania i ten sam wynik co u klienta. `userId` = WŁAŚCICIEL.
 */
@Injectable()
export class ZasobyKontaOperatoraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly slowSql: SlowSqlService,
    private readonly siteStats: SiteStatsService,
  ) {}

  private async konto(subscriptionId: string) {
    const account = await this.prisma.account.findUnique({
      where: { subscriptionId },
      select: {
        daUsername: true,
        domain: true,
        status: true,
        cpuLimit: true,
        ramLimitMb: true,
        ioLimitKbps: true,
        iopsLimit: true,
        entryProcesses: true,
        nprocLimit: true,
        server: { select: { lveFaults: true, lveFaultsAt: true } },
      },
    });
    if (!account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    return account;
  }

  async widok(subscriptionId: string, userId: string) {
    const a = await this.konto(subscriptionId);
    const [polaczenie, wolneSql, strona] = await Promise.all([
      this.directAdmin.getConnectionInfo(subscriptionId, userId),
      this.slowSql.status(subscriptionId, userId),
      a.domain
        ? this.siteStats.status(subscriptionId, userId, a.domain).catch((err: unknown) => ({
            domena: a.domain,
            blad: hostingFetchErrorMessage(err instanceof Error ? err.message : String(err)),
          }))
        : null,
    ]);
    return {
      login: a.daUsername,
      domena: a.domain,
      // Limity efektywne konta (plan + autoskalowanie) — te same, które agent nakłada przez lvectl.
      limity: {
        cpuProcent: a.cpuLimit,
        ep: a.entryProcesses,
        nproc: a.nprocLimit,
        ramMb: a.ramLimitMb,
        ioKbps: a.ioLimitKbps,
        iops: a.iopsLimit,
      },
      // Audyt Fal 2 — konto zawieszone nie trafia do raportu agenta: brak danych, nie „0 odbić”.
      faulty: faultyKonta(a.server, a.daUsername, Date.now(), a.status === 'ACTIVE'),
      inody: { uzyte: polaczenie.inodes.used, limit: polaczenie.inodes.limit, blad: polaczenie.fetchError },
      wolneSql,
      strona,
    };
  }

  /**
   * Zleca świeży odczyt wolnych zapytań i statystyk strony (zadania SLOW_SQL i SITE_STATS — tylko czytają logi
   * na węźle). Odczyt już w toku nie jest błędem — wynik i tak przyjdzie; każdy inny błąd idzie do operatora.
   */
  async odczytaj(subscriptionId: string, userId: string, zlecajacyId: string) {
    const a = await this.konto(subscriptionId);
    const juzWToku = (err: unknown) => {
      if (!(err instanceof ConflictException)) throw err;
    };
    await this.slowSql.odswiez(subscriptionId, userId, zlecajacyId).catch(juzWToku);
    if (a.domain) await this.siteStats.odswiez(subscriptionId, userId, a.domain, zlecajacyId).catch(juzWToku);
    return this.widok(subscriptionId, userId);
  }
}
