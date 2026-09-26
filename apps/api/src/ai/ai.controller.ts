import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AiService } from './ai.service.js';
import { AiChatService } from './ai-chat.service.js';
import { AiProviderService } from './ai-provider.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { AiChatRequestDto } from './dto/ai.dto.js';
import { KbSuggestDto } from '../tickets/tickets.dto.js';

/** Tożsamość z JWT: `principalUserId` = człowiek za subkontem albo impersonacją. */
type Uzytkownik = { userId: string; principalUserId?: string };

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly chat: AiChatService,
    private readonly provider: AiProviderService,
    private readonly knowledge: KnowledgeBaseService,
  ) {}

  /** Client-facing: lista artykułów Bazy Wiedzy widocznych dla klienta. */
  @Get('kb')
  listKb() {
    return this.knowledge.listClientDocs();
  }

  /** Client-facing: pełna treść artykułu (tylko CLIENT/ALL). */
  @Get('kb/:id')
  getKb(@Param('id') id: string) {
    return this.knowledge.getClientDoc(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Post('tickets/:id/suggestion')
  supportSuggestion(@Param('id') ticketId: string, @CurrentUser() user: Uzytkownik) {
    return this.ai.supportSuggestion(ticketId, user.principalUserId ?? user.userId);
  }

  @Post('services/:id/forecast')
  serviceForecast(@Param('id') subscriptionId: string, @CurrentUser() user: Uzytkownik) {
    return this.ai.serviceForecast(
      subscriptionId,
      user.userId,
      user.principalUserId ?? user.userId,
    );
  }

  /** SUP-1 — KB article suggestions for the client support form (deflection). */
  @Post('kb-suggest')
  @HttpCode(200)
  kbSuggest(@Body() body: KbSuggestDto) {
    return this.chat.kbSuggest(body.query, body.topic);
  }

  /** Client-facing hosting assistant (RAG over the CLIENT/ALL knowledge base). */
  @Post('chat')
  @HttpCode(200)
  clientChat(@Body() dto: AiChatRequestDto, @CurrentUser() user: Uzytkownik) {
    return this.chat.ask({
      question: dto.question,
      audience: 'CLIENT',
      history: dto.history,
      userId: user.userId,
      actorUserId: user.principalUserId ?? user.userId,
      subscriptionId: dto.subscriptionId ?? null,
    });
  }

  /** Internal assistant for BOK/ops (RAG over the STAFF/ALL knowledge base). */
  @UseGuards(RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Post('staff/chat')
  @HttpCode(200)
  staffChat(@Body() dto: AiChatRequestDto, @CurrentUser() user: Uzytkownik) {
    return this.chat.ask({
      question: dto.question,
      audience: 'STAFF',
      history: dto.history,
      userId: user.userId,
      actorUserId: user.principalUserId ?? user.userId,
    });
  }

  @Get('status')
  async status() {
    const { dostawca: provider } = await this.provider.opis('szybki');
    return {
      provider,
      configured: await this.provider.dostepny('szybki'),
      embeddings: this.provider.embeddingsEnabled(),
    };
  }
}
