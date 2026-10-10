import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
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
import { kanonicznyIp, stanBlokad, type TrybBlokad } from './blokady-ip.js';

export class AdresIpDto {
  @IsString() @MaxLength(45) ip!: string;
}

export class OdblokujIpWezlaDto extends AdresIpDto {
  @IsString() @MaxLength(500) powod!: string;
}

export class BialaListaDto extends OdblokujIpWezlaDto {
  @IsIn(['dodaj', 'usun']) akcja!: 'dodaj' | 'usun';
}

export const MIN_POWOD_IP = 10;

/**
 * F3.2 (D5) — blokady IP fail2ban całego węzła (NOC): lista z jailem, czasem i powodem, odblokowanie dowolnego adresu,
 * biała lista (ignoreip). Przez zadanie IP_BLOCKS (ops/scripts/node-ip-blocks.sh, podpisany skrypt agenta); jedna
 * operacja na węzeł naraz. Tylko IP_BLOCKS_NODE (NOC) i ADMIN; odblokowanie i zmiana listy z powodem w dzienniku.
 * Odblokowanie IP konkretnego klienta przez L2 jest na karcie usługi (blokady-ip-konta.service.ts).
 */
@Injectable()
export class BlokadyIpWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async wezel(serverId: string) {
    const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { id: true, status: true } });
    if (!s) throw new NotFoundException('Nie znaleziono węzła.');
    return s;
  }

  /** Wszystkie zadania IP_BLOCKS węzła (także zlecone z kart usług) — lista po każdej operacji jest pełna. */
  zadania(serverId: string) {
    return this.prisma.nodeTask.findMany({
      where: { serverId, kind: NodeTaskKind.IP_BLOCKS },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async stan(serverId: string) {
    await this.wezel(serverId);
    return stanBlokad(await this.zadania(serverId));
  }

  /** Kolejkuje zadanie IP_BLOCKS na węźle; 409, gdy poprzednie jeszcze trwa. `accountId` — zlecenie z karty usługi. */
  async zlec(serverId: string, operatorUserId: string, tryb: TrybBlokad, ip: string | null, accountId: string | null = null) {
    const s = await this.wezel(serverId);
    if (s.status !== 'ACTIVE' && s.status !== 'MAINTENANCE') throw new BadRequestException('Węzeł nie jest aktywny.');
    const zadania = await this.zadania(serverId);
    if (stanBlokad(zadania).wToku) throw new ConflictException('Na tym węźle trwa już operacja na blokadach IP — chwila.');
    return this.prisma.nodeTask.create({
      data: {
        serverId,
        accountId,
        kind: NodeTaskKind.IP_BLOCKS,
        status: NodeTaskStatus.QUEUED,
        requestedById: operatorUserId,
        payload: { mode: tryb, ...(ip ? { ip } : {}) },
      },
    });
  }

  async wczytaj(serverId: string, operatorUserId: string) {
    await this.zlec(serverId, operatorUserId, 'list', null);
    await this.audit.record({ action: SupportActions.NODE_IP_BLOCKS_VIEWED, actorUserId: operatorUserId, details: { serverId } });
    return stanBlokad(await this.zadania(serverId));
  }

  private wymagaj(ip: string, powod: string) {
    const adres = kanonicznyIp(ip);
    if (!adres) throw new BadRequestException('Podaj jeden adres IPv4 albo IPv6 (np. 203.0.113.7).');
    const p = (powod ?? '').trim();
    if (p.length < MIN_POWOD_IP) throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_IP} znaków) — zapisze się w dzienniku.`);
    return { adres, p };
  }

  async odblokuj(serverId: string, operatorUserId: string, ip: string, powod: string) {
    const { adres, p } = this.wymagaj(ip, powod);
    const t = await this.zlec(serverId, operatorUserId, 'unban', adres);
    await this.audit.record({ action: SupportActions.NODE_IP_UNBLOCK_QUEUED, actorUserId: operatorUserId, details: { serverId, ip: adres, powod: p, taskId: t.id } });
    return stanBlokad(await this.zadania(serverId));
  }

  async bialaLista(serverId: string, operatorUserId: string, ip: string, powod: string, akcja: 'dodaj' | 'usun') {
    const { adres, p } = this.wymagaj(ip, powod);
    const t = await this.zlec(serverId, operatorUserId, akcja === 'dodaj' ? 'allow' : 'disallow', adres);
    await this.audit.record({
      action: SupportActions.NODE_IP_ALLOWLIST_CHANGED,
      actorUserId: operatorUserId,
      details: { serverId, ip: adres, akcja, powod: p, taskId: t.id },
    });
    return stanBlokad(await this.zadania(serverId));
  }
}

@Controller('admin/servers/:id/blokady-ip')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('IP_BLOCKS_NODE')
export class BlokadyIpWezlaAdminController {
  constructor(private readonly blokady: BlokadyIpWezlaService) {}

  @Get()
  stan(@Param('id') id: string) {
    return this.blokady.stan(id);
  }

  @Post('wczytaj')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-blokady-ip' })
  wczytaj(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.blokady.wczytaj(id, actor.userId);
  }

  @Post('odblokuj')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-blokady-ip-zmiana' })
  odblokuj(@Param('id') id: string, @Body() b: OdblokujIpWezlaDto, @CurrentUser() actor: { userId: string }) {
    return this.blokady.odblokuj(id, actor.userId, b.ip, b.powod);
  }

  @Post('biala-lista')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:wezel-blokady-ip-zmiana' })
  bialaLista(@Param('id') id: string, @Body() b: BialaListaDto, @CurrentUser() actor: { userId: string }) {
    return this.blokady.bialaLista(id, actor.userId, b.ip, b.powod, b.akcja);
  }
}
