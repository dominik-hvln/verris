import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { EcoDrzewaService } from './eco-drzewa.service.js';
import { PotwierdzSadzenieDto, UstawieniaDrzewDto, WymianaNaDrzewoDto } from './dto/eco-drzewa.dto.js';

type Uzytkownik = { userId: string; principalUserId?: string; customerOwnerId?: string | null; impersonatedBy?: string };

/** Panel klienta — drzewa z programu EKO (W6, decyzja 12). */
@Controller('eco/drzewa')
@UseGuards(JwtAuthGuard)
export class EcoDrzewaController {
  constructor(private readonly drzewa: EcoDrzewaService) {}

  @Get()
  panel(@CurrentUser() user: Uzytkownik) {
    return this.drzewa.panelKlienta(user.userId);
  }

  @Post('wymiana')
  @HttpCode(200)
  wymien(@CurrentUser() user: Uzytkownik, @Body() dto: WymianaNaDrzewoDto) {
    return this.drzewa.wymien(user, dto);
  }
}

/** Admin — ustawienia drzew, stan puli, zamówienia sadzenia i ręczne rozstrzygnięcie zamówień niepewnych. */
@Controller('admin/eco/drzewa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class EcoDrzewaAdminController {
  constructor(private readonly drzewa: EcoDrzewaService) {}

  @Get()
  panel() {
    return this.drzewa.panelAdmina();
  }

  @Patch('ustawienia')
  @HttpCode(200)
  zapisz(@Body() dto: UstawieniaDrzewDto, @CurrentUser() actor: Uzytkownik) {
    return this.drzewa.zapiszUstawienia(dto, actor.principalUserId ?? actor.userId);
  }

  @Post('saldo')
  @HttpCode(200)
  saldo() {
    return this.drzewa.saldoAdmin();
  }

  @Post('przebieg')
  @HttpCode(200)
  przebieg() {
    return this.drzewa.przebieg();
  }

  @Post('zamowienia/:id/ponow')
  @HttpCode(200)
  ponow(@Param('id') id: string, @CurrentUser() actor: Uzytkownik) {
    return this.drzewa.ponow(id, actor.principalUserId ?? actor.userId);
  }

  @Post('zamowienia/:id/potwierdz')
  @HttpCode(200)
  potwierdz(@Param('id') id: string, @Body() dto: PotwierdzSadzenieDto, @CurrentUser() actor: Uzytkownik) {
    return this.drzewa.potwierdz(id, dto, actor.principalUserId ?? actor.userId);
  }
}
