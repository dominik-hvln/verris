import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { VatWeryfikacjaService } from './vat-weryfikacja.service.js';
import { CofnijWeryfikacjeVatDto, ZmienDaneVatDto, ZweryfikujVatDto } from './dto/vat-weryfikacja.dto.js';

/**
 * Decyzja 2026-10-09 — status VAT nabywcy na karcie klienta: weryfikacja nabywcy spoza UE
 * i zmiana kraju/NIP po pierwszej płatności. Zmiany: BILLING_MANAGE (finanse), odczyt: BILLING_VIEW.
 */
@Controller('admin/billing/nabywcy')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class VatWeryfikacjaAdminController {
  constructor(private readonly svc: VatWeryfikacjaService) {}

  @Get(':userId/vat')
  @StaffPerm('BILLING_VIEW')
  status(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() op: { userId: string; role: Role }) {
    return this.svc.status(userId, op);
  }

  @Post(':userId/vat/weryfikacja')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE')
  zweryfikuj(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ZweryfikujVatDto,
    @CurrentUser() op: { userId: string; role: Role },
  ) {
    return this.svc.zweryfikuj(userId, dto.podstawa, op);
  }

  @Post(':userId/vat/cofniecie')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE')
  cofnij(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CofnijWeryfikacjeVatDto,
    @CurrentUser() op: { userId: string; role: Role },
  ) {
    return this.svc.cofnij(userId, dto.powod, op);
  }

  @Patch(':userId/vat/dane')
  @StaffPerm('BILLING_MANAGE')
  zmienDane(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ZmienDaneVatDto,
    @CurrentUser() op: { userId: string; role: Role },
  ) {
    return this.svc.zmienDane(userId, dto, op);
  }
}
