import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AiModule } from '../ai/ai.module.js';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';
import { KreatorMarkiAdminController } from './kreator-marki.admin.controller.js';
import { OfertaMarkiController } from './oferta-marki.controller.js';
import { StopkaEmailInstrukcja, USTAW_STOPKE_EMAIL } from './stopka-email.js';

/**
 * Kreator marki (paczka 130, faza 1): konfiguracja modułu (admin), publiczna oferta dla verris.pl i stopka e-mail
 * (interfejs UstawStopkeEmail – dziś tylko instrukcja + kod HTML, patrz stopka-email.ts). Faza 2 dokłada tu API
 * kreatora marki dla klienta (marki, serie, eksport) i korzysta z KonfiguracjaMarkiService oraz USTAW_STOPKE_EMAIL.
 */
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [KreatorMarkiAdminController, OfertaMarkiController],
  providers: [KonfiguracjaMarkiService, { provide: USTAW_STOPKE_EMAIL, useClass: StopkaEmailInstrukcja }],
  exports: [KonfiguracjaMarkiService, USTAW_STOPKE_EMAIL],
})
export class KreatorMarkiModule {}
