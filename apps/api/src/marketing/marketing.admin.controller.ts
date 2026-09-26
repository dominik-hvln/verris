import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, MarketingCampaignStatus, MarketingSegment } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { MarketingCampaignService } from './marketing-campaign.service.js';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

class CreateCampaignDto {
  @IsString() @MinLength(3) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(10) @MaxLength(100_000) bodyMarkdown!: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string | null;
  /** Link w mailu do wszystkich klientów z segmentu — tylko http(s). */
  @IsOptional() @Matches(/^https?:\/\/[^\s"'<>]+$/i, { message: 'Link CTA musi zaczynać się od http(s)://' }) @MaxLength(2000)
  ctaUrl?: string | null;
  @IsEnum(MarketingSegment) segment!: MarketingSegment;
  /** ISO datetime — `null`/brak = DRAFT (do zatwierdzenia). */
  @IsOptional() @IsISO8601() scheduledAt?: string | null;
}

class ScheduleCampaignDto {
  /** Jeżeli brak — natychmiast (now). */
  @IsOptional() @IsISO8601() scheduledAt?: string | null;
}

@Controller('admin/marketing/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('PROMO_MANAGE')
export class MarketingAdminController {
  constructor(private readonly campaigns: MarketingCampaignService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCampaignDto,
  ) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    return this.campaigns.create({
      name: dto.name,
      description: dto.description ?? null,
      subject: dto.subject,
      bodyMarkdown: dto.bodyMarkdown,
      ctaLabel: dto.ctaLabel ?? null,
      ctaUrl: dto.ctaUrl ?? null,
      segment: dto.segment,
      scheduledAt,
      actorUserId: user.userId,
    });
  }

  @Get()
  list(@Query('status') status?: MarketingCampaignStatus) {
    return this.campaigns.list({ status });
  }

  @Get('segments/:segment/count')
  estimate(@Param('segment') segment: MarketingSegment) {
    return this.campaigns
      .estimateRecipients(segment)
      .then((count) => ({ segment, count }));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Patch(':id/schedule')
  schedule(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.campaigns.schedule(id, {
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      actorUserId: user.userId,
    });
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.campaigns.cancel(id, user.userId);
  }
}
