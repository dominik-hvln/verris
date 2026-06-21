import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PlatformSettingsService } from './platform-settings.service';

@Controller('platform-settings')
@UseGuards(JwtAuthGuard)
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  /** Client panel — EKO thresholds, idle timeout, redeem rates. */
  @Get('client')
  @HttpCode(200)
  getClientConfig() {
    return this.settings.getClientConfig();
  }

  /** UX-3 — oferta okresu próbnego (chooser zamawiania). */
  @Get('trial-offer')
  @HttpCode(200)
  getTrialOffer() {
    return this.settings.getTrialOffer();
  }

  /** Staff panel — idle session timeout (minutes). */
  @Get('staff')
  @UseGuards(RolesGuard)
  @Roles(Role.STAFF)
  @HttpCode(200)
  getStaffSessionConfig() {
    return this.settings.getStaffSessionConfig();
  }

  /** Admin panel — idle session timeout (minutes). */
  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(200)
  getAdminSessionConfig() {
    return this.settings.getAdminSessionConfig();
  }
}
