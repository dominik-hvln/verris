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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MarketingCampaignService } from './marketing-campaign.service';

interface CreateCampaignDto {
  name: string;
  description?: string | null;
  subject: string;
  bodyMarkdown: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  segment: MarketingSegment;
  /** ISO datetime — `null`/brak = DRAFT (do zatwierdzenia). */
  scheduledAt?: string | null;
}

interface ScheduleCampaignDto {
  /** Jeżeli brak — natychmiast (now). */
  scheduledAt?: string | null;
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
