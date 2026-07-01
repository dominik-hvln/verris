import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyticsSitesService } from './analytics-sites.service';

class CreateSiteDto {
  @IsString() @MinLength(4) @MaxLength(253)
  domain!: string;
}
class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * AN — panel klienta: zarządzanie property analityki + statystyki.
 * Account-scoped: serwis weryfikuje, że subskrypcja i property należą do usera.
 */
@Controller('analytics-sites/:subscriptionId')
@UseGuards(JwtAuthGuard)
export class AnalyticsSitesController {
  constructor(private readonly analytics: AnalyticsSitesService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }, @Param('subscriptionId') sub: string) {
    return this.analytics.listSites(user.userId, sub);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: { userId: string }, @Param('subscriptionId') sub: string, @Body() dto: CreateSiteDto) {
    return this.analytics.createSite(user.userId, sub, dto.domain);
  }

  @Patch(':siteId')
  setEnabled(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') sub: string,
    @Param('siteId') siteId: string,
    @Body() dto: SetEnabledDto,
  ) {
    return this.analytics.setEnabled(user.userId, sub, siteId, dto.enabled);
  }

  @Delete(':siteId')
  remove(@CurrentUser() user: { userId: string }, @Param('subscriptionId') sub: string, @Param('siteId') siteId: string) {
    return this.analytics.deleteSite(user.userId, sub, siteId);
  }

  @Get(':siteId/stats')
  stats(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') sub: string,
    @Param('siteId') siteId: string,
    @Query('days') days?: string,
  ) {
    return this.analytics.stats(user.userId, sub, siteId, days ? Number.parseInt(days, 10) : 30);
  }
}
