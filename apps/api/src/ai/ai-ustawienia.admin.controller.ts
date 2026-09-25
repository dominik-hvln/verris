import { Body, Controller, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit/audit.service';
import { AdminCustomerActions } from '../common/audit/audit.actions';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService, FUNKCJE_KLIENTA_AI, KLUCZ_KONFIGURACJI_AI } from './ai-provider.service';
import { ZNANE_MODELE_AI, odczytajKonfiguracjeAi } from './ai-modele';
import { UstawieniaAiDto } from './dto/ai.dto';

/** L-11 — admin wybiera dostawcę i model każdego poziomu AI, ceny i limit klienta; widzi koszty. */
@Controller('admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AiUstawieniaAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly audit: AuditService,
  ) {}

  @Get('ustawienia')
  async ustawienia() {
    return {
      konfiguracja: await this.provider.konfiguracja(),
      znaneModele: ZNANE_MODELE_AI,
      klucze: { openai: Boolean(this.provider.klucz('openai')), anthropic: Boolean(this.provider.klucz('anthropic')) },
    };
  }

  /** DTO odrzuca złe pola; ceny dodatkowo filtruje odczytajKonfiguracjeAi (ta sama walidacja co przy odczycie). */
  @Patch('ustawienia')
  @HttpCode(200)
  async zapisz(@Body() body: UstawieniaAiDto, @CurrentUser() actor: { userId: string }) {
    const konf = odczytajKonfiguracjeAi(JSON.stringify(body));
    const value = JSON.stringify(konf);
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ_KONFIGURACJI_AI },
      create: { key: KLUCZ_KONFIGURACJI_AI, value, updatedByUserId: actor.userId },
      update: { value, updatedByUserId: actor.userId },
    });
    this.provider.wyczyscCache();
    await this.audit.record({
      action: AdminCustomerActions.AI_SETTINGS_UPDATED,
      userId: actor.userId,
      actorUserId: actor.userId,
      details: { szybki: konf.szybki, analiza: konf.analiza, limitKlientaUsd: konf.limitKlientaUsd },
    });
    return this.ustawienia();
  }

  /** Koszty: 30 dni per funkcja i model, bieżący miesiąc z prognozą, klienci z największym zużyciem. */
  @Get('koszty')
  async koszty() {
    const teraz = new Date();
    const od30 = new Date(teraz.getTime() - 30 * 86_400_000);
    const poczatekMies = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1));
    const dniMies = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth() + 1, 0)).getUTCDate();
    const dzien = Math.max(1, (teraz.getTime() - poczatekMies.getTime()) / 86_400_000);

    const [grupy, mies, top] = await Promise.all([
      this.prisma.aiInteractionLog.groupBy({
        by: ['feature', 'model'],
        where: { createdAt: { gte: od30 } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      }),
      this.prisma.aiInteractionLog.aggregate({ where: { createdAt: { gte: poczatekMies } }, _sum: { costUsd: true } }),
      this.prisma.aiInteractionLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: poczatekMies }, feature: { in: FUNKCJE_KLIENTA_AI }, userId: { not: null } },
        _sum: { costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: 'desc' } },
        take: 10,
      }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: top.map((t) => t.userId as string) } },
      select: { id: true, email: true },
    });
    const email = new Map(users.map((u) => [u.id, u.email]));
    const { limitKlientaUsd } = await this.provider.konfiguracja();
    const miesiacUsd = Number(mies._sum.costUsd ?? 0);
    return {
      limitKlientaUsd,
      miesiacUsd,
      prognozaMiesiacaUsd: (miesiacUsd / dzien) * dniMies,
      ostatnie30Dni: grupy
        .map((g) => ({
          funkcja: g.feature,
          poziom: g.feature.startsWith('chatbot_') ? 'szybki' : 'analiza',
          model: g.model ?? '—',
          wywolania: g._count._all,
          tokenyWej: g._sum.inputTokens ?? 0,
          tokenyWyj: g._sum.outputTokens ?? 0,
          kosztUsd: Number(g._sum.costUsd ?? 0),
        }))
        .sort((a, b) => b.kosztUsd - a.kosztUsd),
      klienci: top.map((t) => ({
        userId: t.userId as string,
        email: email.get(t.userId as string) ?? '—',
        wywolania: t._count._all,
        kosztUsd: Number(t._sum.costUsd ?? 0),
      })),
    };
  }
}
