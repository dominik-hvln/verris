import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Prisma, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AlarmyService, type WagaAlarmu } from '../alarmy/alarmy.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

/**
 * 13.10 — strażnik węzła (ops/scripts/verris-straznik.sh): węzeł sam wykrywa awarię, zapisuje diagnozę,
 * naprawia (drabina kroków) i raportuje tutaj. Panel trzyma zdarzenia, alarmuje adminów (panel + e-mail + push)
 * i pilnuje, żeby naprawa, która utknęła, też dała alarm. Restart węzła — wyłącznik `straznik.restartWezla`.
 */

export const STANY_STRAZNIKA = ['naprawa', 'naprawiono', 'nie_naprawiono', 'restart', 'tylko_alarm'] as const;
export type StanStraznika = (typeof STANY_STRAZNIKA)[number];
/** Ustawienie platformy: czy strażnik może zrestartować węzeł (decyzja właściciela 13.10: tak, w ostateczności). */
export const KLUCZ_RESTARTU = 'straznik.restartWezla';
/** Naprawa bez wyniku dłużej niż tyle — alarm „naprawa utknęła” (drabina trwa najwyżej kilka minut). */
export const UTKNIETA_MIN = 15;

export class KrokStraznikaDto {
  @IsString() @MaxLength(40) at!: string;
  @IsString() @MaxLength(200) krok!: string;
  @IsString() @MaxLength(500) wynik!: string;
}

export class ZdarzenieStraznikaDto {
  @IsUUID() id!: string;
  @IsString() @MaxLength(60) rodzaj!: string;
  @IsIn(STANY_STRAZNIKA) stan!: StanStraznika;
  @IsString() @MaxLength(2000) objaw!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => KrokStraznikaDto) kroki!: KrokStraznikaDto[];
  @IsString() @MaxLength(65000) diagnoza!: string;
  @IsOptional() @IsISO8601() wykrytoAt?: string;
  @IsOptional() @IsString() @MaxLength(300) katalog?: string;
}

export class UstawieniaStraznikaDto {
  @IsBoolean() restartWezla!: boolean;
}

export function loadStraznikScript(): string {
  const kandydaci = [
    join(process.cwd(), 'ops/scripts/verris-straznik.sh'),
    join(process.cwd(), '../../ops/scripts/verris-straznik.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/verris-straznik.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/verris-straznik.sh'),
  ];
  for (const p of kandydaci) if (existsSync(p)) return readFileSync(p, 'utf8');
  throw new Error('verris-straznik.sh not found in monorepo');
}

const NAZWA_RODZAJU: Record<string, string> = {
  lve: 'izolacja kont (LVE) — strony PHP nie działają',
  strony: 'seria błędów 503 stron',
  dysk: 'dysk prawie pełny',
  rsyslog: 'rsyslog nie zapisuje logów systemowych (/var/log/messages, /var/log/secure)',
};
export const nazwaRodzaju = (r: string) =>
  NAZWA_RODZAJU[r] ?? (r.startsWith('usluga:') ? `usługa ${r.slice(7)} nie działa` : r);

/** Treść alarmu: objaw + kroki (zwięźle), bez pełnej diagnozy — ta jest w panelu. */
export function trescAlarmu(z: { objaw: string; kroki: unknown }): string {
  const kroki = (Array.isArray(z.kroki) ? z.kroki : []) as Array<{ krok?: string; wynik?: string }>;
  return [
    z.objaw.trim(),
    '',
    'Kroki strażnika:',
    ...kroki.slice(-8).map((k) => `- ${k.krok ?? '?'}: ${k.wynik ?? ''}`),
    '',
    'Pełna diagnoza (zapisana przed naprawą) — w panelu admina, karta węzła → Strażnik.',
  ].join('\n');
}

@Injectable()
export class StraznikWezlaService {
  private readonly logger = new Logger(StraznikWezlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alarmy: AlarmyService,
    private readonly audit: AuditService,
  ) {}

  async restartDozwolony(): Promise<boolean> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ_RESTARTU }, select: { value: true } });
    return (w?.value ?? '1') !== '0';
  }

  async ustawRestart(restartWezla: boolean, actorUserId: string) {
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ_RESTARTU },
      create: { key: KLUCZ_RESTARTU, value: restartWezla ? '1' : '0', updatedByUserId: actorUserId },
      update: { value: restartWezla ? '1' : '0', updatedByUserId: actorUserId },
    });
    await this.audit.record({ action: 'STRAZNIK_RESTART_WEZLA_USTAWIONY', actorUserId, details: { restartWezla } });
    return { restartWezla };
  }

  /** Raport z węzła. Alarm przy zmianie stanu na końcowy (albo restart) — powtórka tego samego raportu nic nie wysyła. */
  async przyjmij(serverId: string, d: ZdarzenieStraznikaDto) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId }, select: { id: true, name: true, hostname: true } });
    if (!server) throw new NotFoundException('Nieznany węzeł.');
    const poprzednie = await this.prisma.zdarzenieStraznika.findUnique({
      where: { serverId_wezelId: { serverId, wezelId: d.id } },
      select: { stan: true },
    });
    const koncowy = d.stan !== 'naprawa' && d.stan !== 'restart';
    const dane = {
      rodzaj: d.rodzaj,
      stan: d.stan,
      objaw: d.objaw,
      kroki: d.kroki as unknown as Prisma.InputJsonValue,
      diagnoza: d.diagnoza,
      katalog: d.katalog ?? null,
      zakonczonoAt: koncowy ? new Date() : null,
    };
    const z = await this.prisma.zdarzenieStraznika.upsert({
      where: { serverId_wezelId: { serverId, wezelId: d.id } },
      create: { serverId, wezelId: d.id, wykrytoAt: d.wykrytoAt ? new Date(d.wykrytoAt) : new Date(), ...dane },
      update: dane,
    });
    if (poprzednie?.stan !== d.stan) await this.alarmuj(server, z);
    return { ok: true };
  }

  private async alarmuj(
    server: { id: string; name: string | null; hostname: string | null },
    z: { id: string; rodzaj: string; stan: string; objaw: string; kroki: unknown },
  ) {
    const wezel = server.name ?? server.hostname ?? server.id;
    const co = nazwaRodzaju(z.rodzaj);
    const tytuly: Record<string, [string, WagaAlarmu] | undefined> = {
      naprawiono: [`Węzeł ${wezel}: awaria naprawiona automatycznie (${co})`, 'info'],
      nie_naprawiono: [`Węzeł ${wezel}: AWARIA — strażnik nie naprawił (${co})`, 'krytyczny'],
      restart: [`Węzeł ${wezel}: strażnik restartuje węzeł (${co})`, 'krytyczny'],
      tylko_alarm: [`Węzeł ${wezel}: ${co}`, 'ostrzezenie'],
    };
    const t = tytuly[z.stan];
    if (!t) return;
    await this.alarmy.wyslij({
      klucz: `straznik:${z.id}:${z.stan}`,
      tytul: t[0],
      tresc: trescAlarmu(z),
      link: `/nodes/${server.id}?sekcja=uslugi#straznik`,
      waga: t[1],
      cooldownMin: 24 * 60,
    });
  }

  /** Naprawa bez wyniku albo węzeł, który nie odezwał się po restarcie — alarm (strażnik mógł paść w trakcie). */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'straznik:utkniete' })
  async utkniete(teraz = new Date()): Promise<number> {
    const prog = new Date(teraz.getTime() - UTKNIETA_MIN * 60_000);
    const zdarzenia = await this.prisma.zdarzenieStraznika.findMany({
      where: { stan: { in: ['naprawa', 'restart'] }, updatedAt: { lt: prog } },
      include: { server: { select: { id: true, name: true, hostname: true } } },
      take: 50,
    });
    let ile = 0;
    for (const z of zdarzenia) {
      const wezel = z.server.name ?? z.server.hostname ?? z.server.id;
      const wyslano = await this.alarmy
        .wyslij({
          klucz: `straznik:${z.id}:utknelo`,
          tytul:
            z.stan === 'restart'
              ? `Węzeł ${wezel}: nie zgłosił się po restarcie przez strażnika`
              : `Węzeł ${wezel}: naprawa strażnika nie zakończyła się (${nazwaRodzaju(z.rodzaj)})`,
          tresc: `${trescAlarmu(z)}\n\nOstatni raport: ${z.updatedAt.toISOString()}. Sprawdź węzeł ręcznie.`,
          link: `/nodes/${z.server.id}?sekcja=uslugi#straznik`,
          waga: 'krytyczny',
          cooldownMin: 24 * 60,
        })
        .catch((e: Error) => {
          this.logger.error(`alarm utkniętej naprawy ${z.id}: ${e.message}`);
          return false;
        });
      if (wyslano) ile += 1;
    }
    return ile;
  }

  async lista(serverId: string) {
    const [zdarzenia, restartWezla] = await Promise.all([
      this.prisma.zdarzenieStraznika.findMany({
        where: { serverId },
        orderBy: { wykrytoAt: 'desc' },
        take: 30,
        select: { id: true, rodzaj: true, stan: true, objaw: true, kroki: true, katalog: true, wykrytoAt: true, zakonczonoAt: true, updatedAt: true },
      }),
      this.restartDozwolony(),
    ]);
    return {
      restartWezla,
      zdarzenia: zdarzenia.map((z) => ({
        ...z,
        nazwa: nazwaRodzaju(z.rodzaj),
        wykrytoAt: z.wykrytoAt.toISOString(),
        zakonczonoAt: z.zakonczonoAt?.toISOString() ?? null,
        updatedAt: z.updatedAt.toISOString(),
      })),
    };
  }

  async diagnoza(serverId: string, id: string) {
    const z = await this.prisma.zdarzenieStraznika.findFirst({ where: { id, serverId }, select: { diagnoza: true, katalog: true } });
    if (!z) throw new NotFoundException('Nie ma takiego zdarzenia.');
    return z;
  }
}

interface Operator {
  userId: string;
  actorUserId?: string;
}

@Controller('admin/servers/:id/straznik')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('NODES_VIEW')
export class StraznikWezlaAdminController {
  constructor(private readonly straznik: StraznikWezlaService) {}

  @Get()
  lista(@Param('id') id: string) {
    return this.straznik.lista(id);
  }

  @Get(':zdarzenieId/diagnoza')
  diagnoza(@Param('id') id: string, @Param('zdarzenieId') zid: string) {
    return this.straznik.diagnoza(id, zid);
  }

  /** Wyłącznik restartu węzła przez strażnika — ustawienie całej floty, tylko administrator. */
  @Put('ustawienia')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  ustaw(@Body() b: UstawieniaStraznikaDto, @CurrentUser() op: Operator) {
    return this.straznik.ustawRestart(b.restartWezla, op.actorUserId ?? op.userId);
  }
}
