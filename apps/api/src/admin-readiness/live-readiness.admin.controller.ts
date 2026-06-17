import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LiveReadinessService } from './live-readiness.service';

@Controller('admin/live-readiness')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class LiveReadinessAdminController {
  constructor(private readonly readiness: LiveReadinessService) {}

  @Get()
  @HttpCode(200)
  get() {
    return this.readiness.report();
  }
}
