import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AiModule } from '../ai/ai.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { FontsProxyModule } from '../fonts-proxy/fonts-proxy.module.js';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';
import { KreatorMarkiAdminController } from './kreator-marki.admin.controller.js';
import { OfertaMarkiController } from './oferta-marki.controller.js';
import { StopkaEmailInstrukcja, USTAW_STOPKE_EMAIL } from './stopka-email.js';
import { NapisMarkiService } from './napis-marki.js';
import { ZakupMarkiService } from './zakup-marki.js';
import { KreatorMarkiService } from './kreator-marki.service.js';
import { KreatorMarkiController, KreatorMarkiPlikPublicznyController } from './kreator-marki.controller.js';
import { DostawcaMarkiVerris } from './dostawca-marki.js';

/**
 * Kreator marki – paczka 130 (faza 1): konfiguracja modułu (admin), publiczna oferta dla verris.pl, stopka e-mail
 * (interfejs UstawStopkeEmail – dziś instrukcja + kod HTML). Paczka 131 (faza 2): API klienta wg kontraktu
 * libs/kreator/src/marka/api-kontrakt.ts (marki, serie AI, edycja, wgranie logo, pliki i eksport, zakupy Pakietu
 * i kolejnej marki z portfela/karty/Paynow) i dostawca marki dla Kreatora stron (DostawcaMarkiVerris – kreator.module.ts).
 * Magazyn obiektów (ObjectStorageModule) i audyt są globalne.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AiModule, FontsProxyModule, forwardRef(() => BillingModule)],
  controllers: [KreatorMarkiAdminController, OfertaMarkiController, KreatorMarkiController, KreatorMarkiPlikPublicznyController],
  providers: [
    KonfiguracjaMarkiService,
    { provide: USTAW_STOPKE_EMAIL, useClass: StopkaEmailInstrukcja },
    NapisMarkiService,
    ZakupMarkiService,
    KreatorMarkiService,
    DostawcaMarkiVerris,
  ],
  exports: [KonfiguracjaMarkiService, USTAW_STOPKE_EMAIL, DostawcaMarkiVerris, KreatorMarkiService],
})
export class KreatorMarkiModule {}
