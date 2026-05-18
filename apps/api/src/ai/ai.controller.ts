import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Post('tickets/:id/suggestion')
  supportSuggestion(@Param('id') ticketId: string, @Req() req) {
    return this.ai.supportSuggestion(ticketId, req.user.principalUserId ?? req.user.userId);
  }

  @Post('services/:id/forecast')
  serviceForecast(@Param('id') subscriptionId: string, @Req() req) {
    return this.ai.serviceForecast(
      subscriptionId,
      req.user.userId,
      req.user.principalUserId ?? req.user.userId,
    );
  }

  @Get('status')
  status() {
    const provider = this.config.get<string>('AI_PROVIDER') ?? 'openai-compatible';
    return {
      provider,
      configured: Boolean(this.config.get<string>('AI_API_KEY')),
    };
  }
}
