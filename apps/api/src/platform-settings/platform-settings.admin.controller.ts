import { Body, Controller, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto.js';
import { UpdateSellerCompanyDto, UpdateKsefSettingsDto, UpdateTrybFakturowaniaDto } from './dto/company-settings.dto.js';
import { UpdateTrialOfferDto } from './dto/trial-offer.dto.js';
import { UpdateMonitoringSettingsDto, UpdateWhoisPrivacyPriceDto } from './dto/monitoring-settings.dto.js';
import { UpdateSlaCreditPolicyDto } from './dto/sla-credit-policy.dto.js';
import { UstawWymog2faDto } from './dto/wymog-2fa.dto.js';

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

  /**
   * D10 (10.10) — wymuszenie 2FA dla zespołu: przełącznik tylko dla ADMIN-a (klasa), zmiana w dzienniku.
   * REQUIRE_2FA_FOR_STAFF w env to twarde włączenie — wtedy wyłączenie zwraca 409.
   */
  @Get('wymog-2fa')
  @HttpCode(200)
  getWymog2fa() {
    return this.settings.getWymog2fa();
  }

  @Patch('wymog-2fa')
  @HttpCode(200)
  ustawWymog2fa(@Body() dto: UstawWymog2faDto, @CurrentUser() actor: { userId: string }) {
    return this.settings.ustawWymog2fa(dto.wlaczony, actor.userId);
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

  // A-14 — cena ukrycia danych w WHOIS (puste = usługa niedostępna)
  @Get('whois-privacy')
  @HttpCode(200)
  async getWhoisPrivacy() {
    return { whoisPrivacyPrice: await this.settings.getWhoisPrivacyPrice() };
  }

  @Patch('whois-privacy')
  @HttpCode(200)
  updateWhoisPrivacy(
    @Body() dto: UpdateWhoisPrivacyPriceDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.updateWhoisPrivacyPrice(dto.whoisPrivacyPrice, actor.userId);
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
        maintenanceCapMinutes: dto.maintenanceCapMinutes,
      },
      actor.userId,
    );
  }

  /** FAK-01 / KSeF 12.10 — tryb fakturowania: `panel` (VFV/VFK + KSeF) albo `zewnetrzny` (VDR/VDK). */
  @Get('faktury-tryb')
  @HttpCode(200)
  getTrybFakturowania() {
    return this.settings.getTrybFakturowania();
  }

  @Patch('faktury-tryb')
  @HttpCode(200)
  updateTrybFakturowania(
    @Body() dto: UpdateTrybFakturowaniaDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.settings.ustawTrybFakturowania(dto.tryb, actor.userId);
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
      },
      actor.userId,
    );
  }
}
