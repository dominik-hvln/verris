import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VpsService } from './vps.service';
import { CreateVpsPlanDto } from './dto/vps.dto';

@Controller('admin/vps')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class VpsAdminController {
  constructor(private readonly vps: VpsService) {}

  @Get('availability')
  availability() {
    return { available: this.vps.isAvailable() };
  }

  /** Hetzner server-type catalogue to help build plans. */
  @Get('server-types')
  serverTypes() {
    return this.vps.serverTypes();
  }

  @Get('plans')
  plans() {
    return this.vps.adminListPlans();
  }

  @Post('plans')
  @HttpCode(201)
  createPlan(@Body() dto: CreateVpsPlanDto, @CurrentUser() user: { userId: string }) {
    return this.vps.createPlan(dto, user.userId);
  }

  @Patch('plans/:id')
  @HttpCode(200)
  updatePlan(
    @Param('id') id: string,
    @Body() dto: Partial<CreateVpsPlanDto>,
    @CurrentUser() user: { userId: string },
  ) {
    return this.vps.updatePlan(id, dto, user.userId);
  }

  @Delete('plans/:id')
  @HttpCode(200)
  deletePlan(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.vps.deletePlan(id, user.userId);
  }
}
