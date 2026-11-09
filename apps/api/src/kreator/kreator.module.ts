import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { KreatorMiniaturaController, KreatorZasobPlikController, KreatorZasobyController } from './zasoby.controller.js';
import { BIBLIOTEKA_ZDJEC, KreatorZasobyService } from './zasoby.service.js';
import { BibliotekaZdjec } from './biblioteka/biblioteka.js';
import { DostawcaPixabay } from './biblioteka/pixabay.js';
import { DostawcaOpenverse } from './biblioteka/openverse.js';
import { DostawcaPexels } from './biblioteka/pexels.js';
import { KreatorWordpressController } from './wordpress/kreator-wordpress.controller.js';
import { KreatorWordpressService } from './wordpress/kreator-wordpress.service.js';
import { FUNKCJE_AI_KREATORA, RENDERER_KREATORA, fabrykaFunkcjiAiKreatora, fabrykaRendereraKreatora } from './zaleznosci.js';
import { GENERATORY_OBRAZOW, KreatorObrazyAiService } from './generowanie/obrazy-ai.service.js';
import { GeneratorBfl } from './generowanie/bfl.js';
import { GeneratorOpenAi } from './generowanie/openai-obrazy.js';

/**
 * Verris Kreator (paczka 119). Funkcje AI (`funkcjeAiKreatora`) i renderer (`renderujStrone`) z @verris/kreator
 * przez tokeny DI – fabryki w zaleznosci.ts; testy podstawiają atrapy.
 * Paczka 121 – publikacja: pliki na koncie hostingu (PlikiHostinguDa – ten sam mechanizm co menedżer plików),
 * fonty z proxy fontów, publiczny link podglądu wersji próbnej (KreatorLinkController).
 * Formularz kontaktowy opublikowanych stron: KreatorFormularzController (POST /kreator/formularz/:token, mail przez
 * MailerService – MailModule jest globalny).
 * Paczka 122 – zdjęcia: biblioteka konta (KreatorZasob + magazyn obiektów, ObjectStorageModule jest globalny),
 * biblioteki zewnętrzne (Pixabay, Openverse, Pexels – klucze PIXABAY_API_KEY / PEXELS_API_KEY), publiczne pliki
 * wariantów (/kreator/z) i miniatury przez proxy (/kreator/biblioteka/m).
 */
@Module({
  imports: [ConfigModule, PrismaModule, AiModule, ServersModule, FontsProxyModule],
  controllers: [
    KreatorController,
    KreatorAdminController,
    KreatorPublikacjaController,
    KreatorLinkController,
    KreatorFormularzController,
    KreatorZasobyController,
    KreatorZasobPlikController,
    KreatorMiniaturaController,
    KreatorWordpressController,
  ],
  providers: [
    KreatorService,
    KreatorPublikacjaService,
    KreatorFormularzService,
    KreatorZasobyService,
    KreatorWordpressService,
    {
      provide: BIBLIOTEKA_ZDJEC,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new BibliotekaZdjec([new DostawcaPixabay(c.get<string>('PIXABAY_API_KEY') || undefined), new DostawcaOpenverse(), new DostawcaPexels(c.get<string>('PEXELS_API_KEY') || undefined)]),
    },
    // Paczka 124 – zdjęcia AI: BFL (BFL_API_KEY) i OpenAI Images (ten sam klucz i adres co asystent AI: AI_API_KEY,
    // AI_API_BASE_URL). Bez klucza dostawca jest wyłączony; włącznik i wybór dostawcy – admin (kreator.konfiguracja).
    KreatorObrazyAiService,
    {
      provide: GENERATORY_OBRAZOW,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => [
        new GeneratorBfl(c.get<string>('BFL_API_KEY') || undefined),
        new GeneratorOpenAi(c.get<string>('AI_API_KEY') || undefined, fetch, c.get<string>('AI_API_BASE_URL') || undefined),
      ],
    },
    { provide: FUNKCJE_AI_KREATORA, useFactory: fabrykaFunkcjiAiKreatora },
    { provide: RENDERER_KREATORA, useFactory: fabrykaRendereraKreatora },
    { provide: RENDERER_PUBLIKACJI, useFactory: fabrykaRendereraPublikacji },
    { provide: PLIKI_HOSTINGU_KREATORA, useClass: PlikiHostinguDa },
  ],
  exports: [KreatorService],
})
export class KreatorModule {}
