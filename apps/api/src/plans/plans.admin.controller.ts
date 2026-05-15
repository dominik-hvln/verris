import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PlansAdminController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.listAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.plans.getById(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreatePlanDto, @CurrentUser() actor: { userId: string }) {
    return this.plans.create(dto, actor.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.plans.update(id, dto, actor.userId);
  }

  @Delete(':id')
  @HttpCode(200)
  deactivate(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.plans.deactivate(id, actor.userId);
  }
}
