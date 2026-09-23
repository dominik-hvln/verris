import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ViesService, type WynikVies } from './vies.service';
import {
  normalizujKraj, numerVatUe, odczytajOss, sprzedazB2cUe, STAWKI_UE, ustalTraktowanieVat, type TraktowanieVat,
} from './vat';

/**
 * M-09 — traktowanie VAT dla konkretnego klienta: profil (kraj, NIP/VAT-UE) +
 * VIES + próg OSS. Jedno miejsce dla doładowania, faktur ze Stripe, proformy
 * i blokady płatności kartą dla klientów rozliczanych netto.
 */
@Injectable()
export class VatNabywcyService {
  private readonly logger = new Logger(VatNabywcyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vies: ViesService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async ustal(userId: string): Promise<{ traktowanie: TraktowanieVat; vies: WynikVies | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { country: true, nip: true } });
    const kraj = normalizujKraj(user?.country);
    let vies: WynikVies | null = null;
    if (kraj !== 'PL' && kraj in STAWKI_UE) {
      const nr = numerVatUe(kraj, user?.nip);
      if (nr) {
        const nipSprzedawcy = ((await this.platformSettings.getSellerCompany()).nip ?? '').replace(/\D/g, '');
        vies = await this.vies.sprawdz(nr.kodVies, nr.numer, nipSprzedawcy ? { kodKraju: 'PL', numer: nipSprzedawcy } : null);
      }
    }
    const [oss, s] = await Promise.all([odczytajOss(this.prisma), sprzedazB2cUe(this.prisma, new Date())]);
    const traktowanie = ustalTraktowanieVat({
      kraj,
      viesWazny: vies?.wazny ?? null,
      sprzedazB2cUePln: Math.max(s.biezacy, s.poprzedni),
      ossWlaczone: oss,
    });
    if (traktowanie.wymagaOss) {
      this.logger.error(`OSS: sprzedaż konsumentom z UE przekroczyła próg — włącz OSS po rejestracji (user=${userId})`);
    }
    return { traktowanie, vies };
  }
}
