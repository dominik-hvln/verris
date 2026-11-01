import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiController } from './ai.controller.js';
import { AiKnowledgeAdminController } from './ai-knowledge.admin.controller.js';
import { AiUstawieniaAdminController } from './ai-ustawienia.admin.controller.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiService } from './ai.service.js';
import { AiChatService } from './ai-chat.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { CaptchaService } from '../auth/captcha.service.js';
import { AsystentWwwController } from './asystent-www/asystent-www.controller.js';
import { AsystentWwwService } from './asystent-www/asystent-www.service.js';
import { AsystentRetencjaScheduler } from './asystent-www/asystent-retencja.scheduler.js';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  controllers: [AiController, AiKnowledgeAdminController, AiUstawieniaAdminController, AsystentWwwController],
  // CaptchaService zależy tylko od ConfigService (jak w LeadsModule) — asystent www wymaga captchy od 4. wiadomości.
  providers: [
    AiProviderService,
    AiService,
    AiChatService,
    KnowledgeBaseService,
    CaptchaService,
    AsystentWwwService,
    AsystentRetencjaScheduler,
  ],
  exports: [AiChatService, KnowledgeBaseService, AiService, AiProviderService, AsystentWwwService],
})
export class AiModule {}
