import { BadRequestException, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AccountStatus, NodeTaskKind, NodeTaskStatus, Role } from '@verris/database';
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
import { RBL_ZONES, sprawdzIpNaRbl } from '../deliverability/rbl.js';
import { stanZadan, statystykiPocztyZLogu } from './poczta-wezla.js';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * F3.1 (reszta, D4) — poczta całego węzła dla NOC (MAIL_QUEUE_NODE) i ADMIN:
 * - najwięksi nadawcy i odrzucenia: zadanie MAIL_LOG bez konta, tryb `stats` (ops/scripts/node-mail-log.sh, podpisany
 *   skrypt agenta) — agregat z logu exima (domena nadawcy, użytkownik DA, liczby; odrzucenia: kod SMTP i domena serwera
 *   odbiorcy), bez adresów i treści. API dopasowuje wiersze do kont węzła (domena główna albo login) → karta usługi.
 * - RBL na żądanie: IP węzła na listach RBL_ZONES (te same reguły co monitoring floty co 6 h), wynik od razu.
 * Odczyty w dzienniku zespołu.
 */
@Injectable()
export class PocztaWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async wezel(serverId: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { id: true, status: true, ipAddress: true } });
    if (!s) throw new NotFoundException('Nie znaleziono węzła.');
    return s;
  }

  private zadania(serverId: string) {
    return this.prisma.nodeTask.findMany({
      where: { serverId, accountId: null, kind: NodeTaskKind.MAIL_LOG },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  async statystyki(serverId: string, operatorUserId: string) {
    await this.wezel(serverId);
    const stan = stanZadan(await this.zadania(serverId), statystykiPocztyZLogu);
    const wynik = stan.wynik;
    if (!wynik) return { ...stan, wynik: null };
    // Dopasowanie do kont TEGO węzła: domena główna konta albo login DA (mail() z PHP).
    const domeny = [...new Set(wynik.nadawcy.map((n) => n.domena))];
    const loginy = [...new Set(wynik.nadawcy.map((n) => n.uzytkownik).filter((u): u is string => !!u))];
    const konta = await this.prisma.account.findMany({
      where: { serverId, status: { not: AccountStatus.DELETED }, OR: [{ domain: { in: domeny } }, { daUsername: { in: loginy } }] },
      select: { domain: true, daUsername: true, subscriptionId: true },
    });
    const poLoginie = new Map(konta.map((k) => [k.daUsername, k]));
    const poDomenie = new Map(konta.map((k) => [k.domain.toLowerCase(), k]));
    if (!stan.wToku) {
      await this.audit.record({ action: SupportActions.NODE_MAIL_STATS_VIEWED, actorUserId: operatorUserId, details: { serverId } });
    }
    return {
      ...stan,
      wynik: {
        ...wynik,
        nadawcy: wynik.nadawcy.map((n) => {
          const k = (n.uzytkownik && poLoginie.get(n.uzytkownik)) || poDomenie.get(n.domena);
          return { ...n, konto: k ? { subscriptionId: k.subscriptionId, domena: k.domain, login: k.daUsername } : null };
        }),
      },
    };
  }

  async wczytajStatystyki(serverId: string, operatorUserId: string) {
    const s = await this.wezel(serverId);
    if (s.status !== 'ACTIVE' && s.status !== 'MAINTENANCE') throw new BadRequestException('Węzeł nie jest aktywny.');
    const zadania = await this.zadania(serverId);
    if (zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING)) {
      throw new ConflictException('Statystyki poczty już się wczytują — chwila.');
    }
    await this.prisma.nodeTask.create({
      data: { serverId, kind: NodeTaskKind.MAIL_LOG, status: NodeTaskStatus.QUEUED, requestedById: operatorUserId, payload: { mode: 'stats' } },
    });
    await this.audit.record({ action: SupportActions.NODE_MAIL_STATS_VIEWED, actorUserId: operatorUserId, details: { serverId, zlecenie: true } });
    return this.statystyki(serverId, operatorUserId);
  }

  /** IP węzła na listach RBL teraz. `nieznane` (timeout, odmowa listy) to nie „czysto”. */
  async rbl(serverId: string, operatorUserId: string, sprawdz = sprawdzIpNaRbl) {
    const s = await this.wezel(serverId);
    if (!s.ipAddress || !IPV4.test(s.ipAddress)) throw new BadRequestException('Węzeł nie ma adresu IPv4 do sprawdzenia.');
    const { listed, unknown } = await sprawdz(s.ipAddress);
    const wynik = {
      ip: s.ipAddress,
      sprawdzono: new Date().toISOString(),
      naLiscie: listed,
      nieznane: unknown,
      czyste: RBL_ZONES.filter((z) => !listed.includes(z) && !unknown.includes(z)),
    };
    await this.audit.record({ action: SupportActions.NODE_RBL_CHECKED, actorUserId: operatorUserId, details: { serverId, naLiscie: listed, nieznane: unknown } });
    return wynik;
  }
}

@Controller('admin/servers/:id/poczta')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('MAIL_QUEUE_NODE')
export class PocztaWezlaAdminController {
  constructor(private readonly poczta: PocztaWezlaService) {}

  @Get('statystyki')
  statystyki(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.poczta.statystyki(id, actor.userId);
  }

  @Post('statystyki/wczytaj')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-poczta-statystyki' })
  wczytajStatystyki(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.poczta.wczytajStatystyki(id, actor.userId);
  }

  @Post('rbl')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-rbl' })
  rbl(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.poczta.rbl(id, actor.userId);
  }
}
