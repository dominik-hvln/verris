import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PartnersService } from './partners.service';
import { ProcessPayoutDto, UpdatePartnerProgramDto } from './dto/partner.dto';

type PayoutStatus = 'REQUESTED' | 'PAID' | 'REJECTED';

/** RESELL — administracja programem partnerskim. */
@Controller('admin/partners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PartnersAdminController {
  constructor(private readonly partners: PartnersService) {}

  @Get('config')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_VIEW')
  getConfig() {
    return this.partners.getConfig();
  }

  @Put('config')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('SETTINGS_MANAGE')
  updateConfig(@Body() dto: UpdatePartnerProgramDto, @CurrentUser() actor: { userId: string }) {
    return this.partners.updateConfig(dto, actor.userId);
  }

  @Get('payouts')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_VIEW')
  listPayouts(@Query('status') status?: PayoutStatus) {
    return this.partners.adminListPayouts(status);
  }

  @Post('payouts/:id/process')
  @HttpCode(200)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  processPayout(
    @Param('id') id: string,
    @Body() dto: ProcessPayoutDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.partners.adminProcessPayout(id, dto.action, actor.userId, dto.note);
  }
}
