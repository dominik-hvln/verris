import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiKnowledgeAdminController } from './ai-knowledge.admin.controller';
import { AiProviderService } from './ai-provider.service';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController, AiKnowledgeAdminController],
  providers: [AiProviderService, AiService, AiChatService, KnowledgeBaseService],
  exports: [AiChatService, KnowledgeBaseService],
})
export class AiModule {}
