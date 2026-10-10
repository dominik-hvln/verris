import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { NodeTaskKind, NodeTaskStatus, Role } from '@verris/database';
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
import { FRAZA_KOLEJKI, stanKolejki } from './kolejka-poczty.js';

export class WczytajKolejkeWezlaDto {
  @IsOptional() @IsString() @MaxLength(100) @Matches(FRAZA_KOLEJKI, { message: 'Fraza bez znaków sterujących.' }) szukaj?: string;
}

export class WypchnijKolejkeDto {
  @IsString() @MaxLength(500) powod!: string;
}

/**
 * F3.1 (D4) — kolejka poczty całego węzła (NOC): podgląd nagłówków z wyszukiwaniem i „Wypchnij kolejkę” (exim -qff).
 * Przez zadanie MAIL_QUEUE bez konta (ops/scripts/node-mail-queue.sh, podpisany skrypt agenta). Nagłówki wszystkich
 * klientów węzła to dane osobowe: tylko MAIL_QUEUE_NODE (NOC) i ADMIN, każdy odczyt i wypchnięcie w dzienniku.
 */
@Injectable()
export class KolejkaPocztyWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async wezel(serverId: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { id: true, status: true } });
    if (!s) throw new NotFoundException('Nie znaleziono węzła.');
    return s;
  }

  private zadania(serverId: string) {
    return this.prisma.nodeTask.findMany({
      where: { serverId, accountId: null, kind: NodeTaskKind.MAIL_QUEUE },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async stan(serverId: string, operatorUserId: string) {
    await this.wezel(serverId);
    const stan = stanKolejki(await this.zadania(serverId));
    if (!stan.wToku && stan.wiadomosci.length) {
      await this.audit.record({ action: SupportActions.NODE_MAIL_QUEUE_VIEWED, actorUserId: operatorUserId, details: { serverId, wiadomosci: stan.wiadomosci.length } });
    }
    return stan;
  }

  private async zlec(serverId: string, operatorUserId: string, payload: Record<string, string>) {
    const s = await this.wezel(serverId);
    if (s.status !== 'ACTIVE' && s.status !== 'MAINTENANCE') throw new BadRequestException('Węzeł nie jest aktywny.');
    const zadania = await this.zadania(serverId);
    if (zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING)) {
      throw new ConflictException('Na tym węźle trwa już operacja na kolejce — chwila.');
    }
    await this.prisma.nodeTask.create({
      data: { serverId, kind: NodeTaskKind.MAIL_QUEUE, status: NodeTaskStatus.QUEUED, requestedById: operatorUserId, payload },
    });
    return stanKolejki(await this.zadania(serverId));
  }

  async wczytaj(serverId: string, operatorUserId: string, szukaj?: string) {
    const fraza = (szukaj ?? '').trim();
    if (fraza && !FRAZA_KOLEJKI.test(fraza)) throw new BadRequestException('Fraza: do 100 znaków, bez znaków sterujących.');
    const wynik = await this.zlec(serverId, operatorUserId, { mode: 'list', ...(fraza ? { szukaj: fraza } : {}) });
    await this.audit.record({ action: SupportActions.NODE_MAIL_QUEUE_VIEWED, actorUserId: operatorUserId, details: { serverId, zlecenie: true, ...(fraza ? { szukaj: fraza } : {}) } });
    return wynik;
  }

  /** exim -qff — próba dostarczenia całej kolejki, także zamrożonych; z powodem w dzienniku. */
  async wypchnij(serverId: string, operatorUserId: string, powod: string) {
    const p = (powod ?? '').trim();
    if (p.length < 10) throw new BadRequestException('Podaj powód (min. 10 znaków) — zapisze się w dzienniku.');
    const wynik = await this.zlec(serverId, operatorUserId, { mode: 'flush' });
    await this.audit.record({ action: SupportActions.NODE_MAIL_QUEUE_FLUSHED, actorUserId: operatorUserId, details: { serverId, powod: p } });
    return wynik;
  }
}

@Controller('admin/servers/:id/kolejka-poczty')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('MAIL_QUEUE_NODE')
export class KolejkaPocztyWezlaAdminController {
  constructor(private readonly kolejka: KolejkaPocztyWezlaService) {}

  @Get()
  stan(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.kolejka.stan(id, actor.userId);
  }

  @Post('wczytaj')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-kolejka' })
  wczytaj(@Param('id') id: string, @Body() b: WczytajKolejkeWezlaDto, @CurrentUser() actor: { userId: string }) {
    return this.kolejka.wczytaj(id, actor.userId, b.szukaj);
  }

  @Post('wypchnij')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-kolejka-wypchnij' })
  wypchnij(@Param('id') id: string, @Body() b: WypchnijKolejkeDto, @CurrentUser() actor: { userId: string }) {
    return this.kolejka.wypchnij(id, actor.userId, b.powod);
  }
}
