import { Body, Controller, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { SslService } from './ssl.service.js';

export class CennikSslDto {
  /** { "<id produktu>": "99,99" | "" | null } — pusta cena ukrywa produkt. */
  @IsObject()
  prices!: Record<string, string | null>;
}

/** G-08 — cennik płatnych certyfikatów SSL (admin). */
@Controller('admin/ssl')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SslAdminController {
  constructor(private readonly ssl: SslService) {}

  @Get('products')
  produkty() {
    return this.ssl.produktyAdmin();
  }

  @Patch('prices')
  @HttpCode(200)
  ceny(@Body() body: CennikSslDto, @CurrentUser() actor: { userId: string }) {
    return this.ssl.zapiszCeny(body.prices, actor.userId);
  }
}
