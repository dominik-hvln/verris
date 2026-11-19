import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AdminCustomerActions } from '../common/audit/audit.actions.js';
import { KLUCZ_KONFIGURACJI_MARKI, dostepDoMarki, kontoTestoweMarki, odczytajKonfiguracjeMarki, type KonfiguracjaMarki } from './konfiguracja-marki.js';

/**
 * Kreator marki (paczka 130) – odczyt i zapis konfiguracji modułu (PlatformSetting `kreator-marki.konfiguracja`)
 * oraz sprawdzenie dostępu konta. Faza 2 (API i panel kreatora marki) korzysta z `konfiguracja()` i `dostep()`.
 */
@Injectable()
export class KonfiguracjaMarkiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async konfiguracja(): Promise<KonfiguracjaMarki> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ_KONFIGURACJI_MARKI } }).catch(() => null);
    return odczytajKonfiguracjeMarki(row?.value);
  }

  /**
   * Zapis z audytem (ta sama akcja co konfiguracja Kreatora stron i asystenta – ADMIN_AI_SETTINGS_UPDATED;
   * w szczegółach `kreatorMarki`, lista kont testowych jako liczba – bez e-maili w dzienniku).
   */
  async zapisz(konf: KonfiguracjaMarki, actorUserId: string, zmiana: Record<string, unknown> = {}): Promise<void> {
    const value = JSON.stringify(konf);
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ_KONFIGURACJI_MARKI },
      create: { key: KLUCZ_KONFIGURACJI_MARKI, value, updatedByUserId: actorUserId },
      update: { value, updatedByUserId: actorUserId },
    });
    await this.audit.record({
      action: AdminCustomerActions.AI_SETTINGS_UPDATED,
      userId: actorUserId,
      actorUserId,
      details: { kreatorMarki: { ...konf, kontaTestowe: konf.kontaTestowe.length, ...zmiana } },
    });
  }

  /**
   * Dostęp konta do modułu (bez warunku hostingu – faza 2 dokłada go jak Kreator stron). Tester = zrealizowany kod
   * z zaproszenia do testów (to samo zapytanie co BetaService.czyTester; BetaModule nie eksportuje serwisu).
   */
  async dostep(userId: string): Promise<boolean> {
    const konf = await this.konfiguracja();
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (kontoTestoweMarki(konf, { id: userId, email: u?.email })) return true;
    if (!konf.wlaczony || konf.dostepnosc === 'lista') return false;
    const tester =
      konf.dostepnosc === 'beta' ? (await this.prisma.promoRedemption.count({ where: { userId, promoCode: { betaInvite: { isNot: null } } } })) > 0 : false;
    return dostepDoMarki(konf, { id: userId, email: u?.email, tester });
  }
}
