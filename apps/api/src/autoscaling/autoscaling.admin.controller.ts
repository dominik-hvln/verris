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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AutoscalingPricingService } from './autoscaling-pricing.service.js';
import { CreatePriceRuleDto, UpdatePriceRuleDto } from './dto/price-rule.dto.js';
import { SimulatePricingDto } from './dto/simulate-pricing.dto.js';

@Controller('admin/autoscaling/pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AutoscalingAdminController {
  constructor(private readonly pricing: AutoscalingPricingService) {}

  @Get()
  list() {
    return this.pricing.listAll();
  }

  @Get('revenue')
  revenueLast30Days() {
    return this.pricing.revenueReportLast30Days();
  }

  @Post('simulate')
  @HttpCode(200)
  simulate(@Body() dto: SimulatePricingDto) {
    return this.pricing.simulateEffectiveRate(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.pricing.getById(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreatePriceRuleDto, @CurrentUser() actor: { userId: string }) {
    return this.pricing.create(dto, actor.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePriceRuleDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.pricing.update(id, dto, actor.userId);
  }

  @Delete(':id')
  @HttpCode(200)
  deactivate(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.pricing.deactivate(id, actor.userId);
  }
}
