import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AdminCustomerActions } from '../common/audit/audit.actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { KLUCZ_KONFIGURACJI_KREATORA, miesiacUtc, odczytajKonfiguracjeKreatora } from './konfiguracja.js';
import { KonfiguracjaKreatoraDto } from './dto/kreator.dto.js';
import { KreatorService } from './kreator.service.js';

/**
 * Verris Kreator – konfiguracja (admin; te same strażniki co ai-ustawienia.admin.controller.ts). Modele (tylko
 * Anthropic), włącznik dla wszystkich i konta testowe. UI admina – kolejna paczka.
 */
@Controller('admin/kreator')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KreatorAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly audit: AuditService,
    private readonly kreator: KreatorService,
  ) {}

  @Get('konfiguracja')
  async konfiguracja() {
    const miesiac = miesiacUtc();
    const suma = await this.prisma.kreatorZuzycie.aggregate({
      where: { miesiac },
      _sum: { generacje: true, zmiany: true, kosztUsd: true, cacheZapis: true, cacheOdczyt: true },
    });
    return {
      konfiguracja: await this.kreator.konfiguracja(),
      kluczAnthropic: Boolean(this.provider.klucz('anthropic')),
      miesiac: {
        miesiac,
        generacje: suma._sum.generacje ?? 0,
        zmiany: suma._sum.zmiany ?? 0,
        kosztUsd: Number(suma._sum.kosztUsd ?? 0),
        cacheZapis: suma._sum.cacheZapis ?? 0,
        cacheOdczyt: suma._sum.cacheOdczyt ?? 0,
      },
    };
  }

  /** Zapis przez tę samą walidację co odczyt (odczytajKonfiguracjeKreatora); pola pominięte zostają bez zmian. */
  @Put('konfiguracja')
  async zapisz(@Body() body: KonfiguracjaKreatoraDto, @CurrentUser() actor: { userId: string }) {
    const konf = odczytajKonfiguracjeKreatora(JSON.stringify({ ...(await this.kreator.konfiguracja()), ...body }));
    const value = JSON.stringify(konf);
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ_KONFIGURACJI_KREATORA },
      create: { key: KLUCZ_KONFIGURACJI_KREATORA, value, updatedByUserId: actor.userId },
      update: { value, updatedByUserId: actor.userId },
    });
    await this.audit.record({
      action: AdminCustomerActions.AI_SETTINGS_UPDATED,
      userId: actor.userId,
      actorUserId: actor.userId,
      details: { kreator: { ...konf, kontaTestowe: konf.kontaTestowe.length } },
    });
    return this.konfiguracja();
  }
}
