import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { AiProviderService } from './ai-provider.service';
import { AiChatRequestDto } from './dto/ai.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly chat: AiChatService,
    private readonly provider: AiProviderService,
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

  /** Client-facing hosting assistant (RAG over the CLIENT/ALL knowledge base). */
  @Post('chat')
  @HttpCode(200)
  clientChat(@Body() dto: AiChatRequestDto, @Req() req) {
    return this.chat.ask({
      question: dto.question,
      audience: 'CLIENT',
      history: dto.history,
      userId: req.user.userId,
      actorUserId: req.user.principalUserId ?? req.user.userId,
      subscriptionId: dto.subscriptionId ?? null,
    });
  }

  /** Internal assistant for BOK/ops (RAG over the STAFF/ALL knowledge base). */
  @UseGuards(RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Post('staff/chat')
  @HttpCode(200)
  staffChat(@Body() dto: AiChatRequestDto, @Req() req) {
    return this.chat.ask({
      question: dto.question,
      audience: 'STAFF',
      history: dto.history,
      userId: req.user.userId,
      actorUserId: req.user.principalUserId ?? req.user.userId,
    });
  }

  @Get('status')
  status() {
    const provider = this.config.get<string>('AI_PROVIDER') ?? 'openai-compatible';
    return {
      provider,
      configured: this.provider.isConfigured(),
      embeddings: this.provider.embeddingsEnabled(),
    };
  }
}
