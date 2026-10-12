import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { PowodOperatoraDto } from './dto/akcje-konta.dto.js';
import { LimityIndywidualneService } from './limity-indywidualne.service.js';

export class LimityIndywidualneDto extends PowodOperatoraDto {
  /** { diskLimitMb?, includedTransferGb?, domains?, emailAccounts?, databases? } — zakresy sprawdza serwis (contracts). */
  @IsObject() limity!: Record<string, unknown>;
}

type Aktor = { userId: string; role: string };

/**
 * K3 (PB-53.5) — limity indywidualne usługi z karty usługi (sekcja „Operacje” → „Limity indywidualne”).
 * Tylko ADMIN: darmowe zasoby ponad plan i zmiana zobowiązań węzła; katalog uprawnień personelu nie ma uprawnienia
 * o tym zakresie (CUSTOM_TERMS_MANAGE dotyczy ceny, SUBSCRIPTIONS_MANAGE — cyklu życia bez kosztu zasobów).
 */
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:limity-indywidualne' })
export class LimityIndywidualneAdminController {
  constructor(private readonly limity: LimityIndywidualneService) {}

  @Post(':id/limity')
  @HttpCode(200)
  ustaw(@Param('id') id: string, @Body() b: LimityIndywidualneDto, @CurrentUser() actor: Aktor) {
    return this.limity.ustaw({ subscriptionId: id, operator: actor, powod: b.powod, zgloszenie: b.zgloszenie, limity: b.limity });
  }

  @Post(':id/limity/przywroc')
  @HttpCode(200)
  przywroc(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.limity.ustaw({ subscriptionId: id, operator: actor, powod: b.powod, zgloszenie: b.zgloszenie, limity: {} });
  }
}
