import { Body, Controller, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';
import { UpdateSellerCompanyDto, UpdateKsefSettingsDto } from './dto/company-settings.dto';
import { UpdateTrialOfferDto } from './dto/trial-offer.dto';
import { UpdateMonitoringSettingsDto } from './dto/monitoring-settings.dto';
import { UpdateSlaCreditPolicyDto } from './dto/sla-credit-policy.dto';

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

  // UX-3 — oferta okresu próbnego
  @Get('trial-offer')
  @HttpCode(200)
  getTrialOffer() {
    return this.settings.getTrialOffer();
  }

  @Patch('trial-offer')
  @HttpCode(200)
  updateTrialOffer(
    @Body() dto: UpdateTrialOfferDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateTrialOffer(
      {
        freeEnabled: dto.freeEnabled,
        cardEnabled: dto.cardEnabled,
        annualDiscountPct: dto.annualDiscountPct,
        monthlyDiscountPct: dto.monthlyDiscountPct,
        annualPromoCode: dto.annualPromoCode,
        monthlyPromoCode: dto.monthlyPromoCode,
        introDiscountPeriods: dto.introDiscountPeriods,
      },
      actor.userId,
    );
  }

  // MON-3 — ustawienia monitoringu strony (interwały + cena płatnego)
  @Get('monitoring')
  @HttpCode(200)
  getMonitoring() {
    return this.settings.getMonitoringSettings();
  }

  @Patch('monitoring')
  @HttpCode(200)
  updateMonitoring(
    @Body() dto: UpdateMonitoringSettingsDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateMonitoringSettings(
      {
        freeIntervalMinutes: dto.freeIntervalMinutes,
        paidIntervalMinutes: dto.paidIntervalMinutes,
        paidMonthlyPrice: dto.paidMonthlyPrice,
        paidOffered: dto.paidOffered,
      },
      actor.userId,
    );
  }

  // #11 — polityka kredytów SLA
  @Get('sla-credits')
  @HttpCode(200)
  getSlaCredits() {
    return this.settings.getSlaCreditPolicy();
  }

  @Patch('sla-credits')
  @HttpCode(200)
  updateSlaCredits(
    @Body() dto: UpdateSlaCreditPolicyDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateSlaCreditPolicy(
      {
        enabled: dto.enabled,
        graceMinutes: dto.graceMinutes,
        multiplier: dto.multiplier,
        capPercent: dto.capPercent,
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
