import { Body, Controller, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';
import { UpdateSellerCompanyDto, UpdateKsefSettingsDto } from './dto/company-settings.dto';

@Controller('admin/platform-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PlatformSettingsAdminController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @HttpCode(200)
  getSettings() {
    return this.settings.getAdminSettings();
  }

  @Patch()
  @HttpCode(200)
  updateSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateAdminSettings(dto, actor.userId);
  }

  // Dane sprzedawcy (faktury)
  @Get('company')
  @HttpCode(200)
  getCompany() {
    return this.settings.getSellerCompany();
  }

  @Patch('company')
  @HttpCode(200)
  updateCompany(
    @Body() dto: UpdateSellerCompanyDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateSellerCompany(
      {
        name: dto.name,
        nip: dto.nip ?? '',
        regon: dto.regon ?? '',
        krs: dto.krs ?? '',
        address: dto.address ?? '',
        city: dto.city ?? '',
        postalCode: dto.postalCode ?? '',
        country: dto.country ?? 'PL',
        email: dto.email ?? '',
        bankAccount: dto.bankAccount ?? '',
      },
      actor.userId,
    );
  }

  // Konfiguracja KSeF (sekrety szyfrowane KMS)
  @Get('ksef')
  @HttpCode(200)
  getKsef() {
    return this.settings.getKsefSettings();
  }

  @Patch('ksef')
  @HttpCode(200)
  updateKsef(
    @Body() dto: UpdateKsefSettingsDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateKsefSettings(
      {
        enabled: dto.enabled,
        env: dto.env,
        nip: dto.nip ?? '',
        token: dto.token,
        publicKeyPem: dto.publicKeyPem,
      },
      actor.userId,
    );
  }
}
