import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AiController } from './ai.controller.js';
import { AiKnowledgeAdminController } from './ai-knowledge.admin.controller.js';
import { AiUstawieniaAdminController } from './ai-ustawienia.admin.controller.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiService } from './ai.service.js';
import { AiChatService } from './ai-chat.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController, AiKnowledgeAdminController, AiUstawieniaAdminController],
  providers: [AiProviderService, AiService, AiChatService, KnowledgeBaseService],
  exports: [AiChatService, KnowledgeBaseService, AiService],
})
export class AiModule {}
