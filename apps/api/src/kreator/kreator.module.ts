import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AiModule } from '../ai/ai.module.js';
import { KreatorController } from './kreator.controller.js';
import { KreatorAdminController } from './kreator.admin.controller.js';
import { KreatorService } from './kreator.service.js';
import { FUNKCJE_AI_KREATORA, RENDERER_KREATORA, fabrykaFunkcjiAiKreatora, fabrykaRendereraKreatora } from './zaleznosci.js';

/**
 * Verris Kreator (paczka 119). Funkcje AI (`funkcjeAiKreatora`) i renderer (`renderujStrone`) z @verris/kreator
 * przez tokeny DI – fabryki w zaleznosci.ts; testy podstawiają atrapy.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AiModule],
  controllers: [KreatorController, KreatorAdminController],
  providers: [
    KreatorService,
    { provide: FUNKCJE_AI_KREATORA, useFactory: fabrykaFunkcjiAiKreatora },
    { provide: RENDERER_KREATORA, useFactory: fabrykaRendereraKreatora },
  ],
  exports: [KreatorService],
})
export class KreatorModule {}
