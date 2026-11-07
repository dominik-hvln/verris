import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AiModule } from '../ai/ai.module.js';
import { ServersModule } from '../servers/servers.module.js';
import { FontsProxyModule } from '../fonts-proxy/fonts-proxy.module.js';
import { KreatorController } from './kreator.controller.js';
import { KreatorAdminController } from './kreator.admin.controller.js';
import { KreatorPublikacjaController } from './publikacja.controller.js';
import { KreatorLinkController } from './kreator-link.controller.js';
import { KreatorFormularzController } from './formularz.controller.js';
import { KreatorFormularzService } from './formularz.service.js';
import { KreatorService } from './kreator.service.js';
import { KreatorPublikacjaService } from './publikacja.service.js';
import { PLIKI_HOSTINGU_KREATORA, PlikiHostinguDa } from './pliki-hostingu.js';
import { RENDERER_PUBLIKACJI, fabrykaRendereraPublikacji } from './renderer-publikacji.js';
import { FUNKCJE_AI_KREATORA, RENDERER_KREATORA, fabrykaFunkcjiAiKreatora, fabrykaRendereraKreatora } from './zaleznosci.js';

/**
 * Verris Kreator (paczka 119). Funkcje AI (`funkcjeAiKreatora`) i renderer (`renderujStrone`) z @verris/kreator
 * przez tokeny DI – fabryki w zaleznosci.ts; testy podstawiają atrapy.
 * Paczka 121 – publikacja: pliki na koncie hostingu (PlikiHostinguDa – ten sam mechanizm co menedżer plików),
 * fonty z proxy fontów, publiczny link podglądu wersji próbnej (KreatorLinkController).
 * Formularz kontaktowy opublikowanych stron: KreatorFormularzController (POST /kreator/formularz/:token, mail przez
 * MailerService – MailModule jest globalny).
 */
@Module({
  imports: [ConfigModule, PrismaModule, AiModule, ServersModule, FontsProxyModule],
  controllers: [KreatorController, KreatorAdminController, KreatorPublikacjaController, KreatorLinkController, KreatorFormularzController],
  providers: [
    KreatorService,
    KreatorPublikacjaService,
    KreatorFormularzService,
    { provide: FUNKCJE_AI_KREATORA, useFactory: fabrykaFunkcjiAiKreatora },
    { provide: RENDERER_KREATORA, useFactory: fabrykaRendereraKreatora },
    { provide: RENDERER_PUBLIKACJI, useFactory: fabrykaRendereraPublikacji },
    { provide: PLIKI_HOSTINGU_KREATORA, useClass: PlikiHostinguDa },
  ],
  exports: [KreatorService],
})
export class KreatorModule {}
