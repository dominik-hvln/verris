import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
}
