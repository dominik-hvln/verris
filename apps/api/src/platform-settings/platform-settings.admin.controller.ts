import { Body, Controller, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';

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
}
