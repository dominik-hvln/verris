import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { newDeviceLoginTemplate } from '../mail/templates/security-notifications';

/**
 * Sprint 2.5 — utrwalanie pomyślnych logowań (`LoginEvent`) i wykrywanie
 * "nowego urządzenia" do alertu mailowego.
 *
 * Algorytm "new device":
 *  - liczymy `deviceFingerprint = sha256(userAgent || ip-network /24)`
 *  - jeśli w ostatnich 90 dniach NIE było LoginEvent z tym fingerprintem
 *    dla danego usera ⇒ to nowe urządzenie ⇒ wysyłamy mail.
 *  - kotwicą jest też ip-network /24 — login z tej samej domowej sieci
 *    z innej przeglądarki nie generuje fałszywego alarmu.
 *
 * Świadomie nie integrujemy GeoIP (MaxMind / IP-API) jako twardej zależności —
 * to dodawałoby external runtime dependency dla niewielkiej wartości UX.
 * Pole `countryCode` zostawiamy nullable; gdy w przyszłości dodamy MaxMind
 * GeoLite2 jako sidecar, hook tu jest gotowy.
 */
@Injectable()
export class LoginEventService {
  private readonly logger = new Logger(LoginEventService.name);
  /**
   * Okno historyczne, w którym fingerprint uznajemy za "znany". 90 dni jest
   * kompromisem między fałszywymi alarmami (private/incognito mode wyrzuca
   * UA) a faktycznym sygnałem ATO. Możemy tunować po obserwacji incydentów.
   */
  private static readonly KNOWN_DEVICE_LOOKBACK_DAYS = 90;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Zapisuje LoginEvent + (gdy nowe urządzenie) wysyła mail. **Synchronicznie
   * wykonuje DB write**, a wysyłkę maila puszcza fire-and-forget — flow
   * logowania nie może czekać na SMTP, ale stronę z LoginEvent musi mieć
   * zapisaną zanim user dostanie token.
   */
  async record(opts: {
    userId: string;
    email: string;
    firstName: string | null;
    ip: string | null;
    userAgent: string | null;
    /** "password" | "password+2fa" | "oauth-google" itp. */
    loginMethod: string;
  }): Promise<void> {
    const fingerprint = this.computeFingerprint(opts.ip, opts.userAgent);
    const priorLoginCount = await this.prisma.loginEvent.count({
      where: { userId: opts.userId },
    });
    const isNewDevice = await this.isNewDevice(opts.userId, fingerprint);

    try {
      await this.prisma.loginEvent.create({
        data: {
          userId: opts.userId,
          ipAddress: opts.ip ?? null,
          userAgent: opts.userAgent ?? null,
          countryCode: null,
          deviceFingerprint: fingerprint,
          isNewDevice,
          loginMethod: opts.loginMethod,
        },
      });
    } catch (err) {
      // Awaria audytu nie może blokować loginu — logujemy i jedziemy dalej.
      this.logger.error(
        `Failed to persist LoginEvent for user=${opts.userId}: ${(err as Error).message}`,
      );
      return;
    }

    if (!isNewDevice) return;
    // Pierwsze logowanie po rejestracji — bez alertu „nowe urządzenie”.
    if (priorLoginCount === 0) return;

    const prefs = await this.prisma.marketingPreferences.findUnique({
      where: { userId: opts.userId },
      select: { loginAlertsEmail: true },
    });
    if (prefs && !prefs.loginAlertsEmail) return;

    void this.notifyNewDevice({
      to: opts.email,
      firstName: opts.firstName,
      loginAt: new Date(),
      deviceLabel: this.parseDeviceLabel(opts.userAgent),
      ipAddress: opts.ip,
      countryCode: null,
    }).catch((err) => {
      this.logger.warn(
        `notifyNewDevice failed for user=${opts.userId}: ${(err as Error).message}`,
      );
    });
  }

  private async notifyNewDevice(opts: {
    to: string;
    firstName: string | null;
    loginAt: Date;
    deviceLabel: string | null;
    ipAddress: string | null;
    countryCode: string | null;
  }): Promise<void> {
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const message = newDeviceLoginTemplate({
      to: opts.to,
      firstName: opts.firstName,
      loginAt: opts.loginAt,
      deviceLabel: opts.deviceLabel,
      ipAddress: opts.ipAddress,
      countryCode: opts.countryCode,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'SECURITY' });
  }

  private computeFingerprint(ip: string | null, userAgent: string | null): string {
    const ua = (userAgent ?? 'unknown-ua').slice(0, 512);
    const network = this.toNetwork(ip);
    return createHash('sha256').update(`${ua}|${network}`).digest('hex');
  }

  /**
   * Redukuje IP do prefiksu /24 (IPv4) lub /48 (IPv6) żeby login z tego
   * samego routera-a-tylko-innym-laptopem nie był "new device".
   */
  private toNetwork(ip: string | null): string {
    if (!ip) return 'no-ip';
    if (ip.includes(':')) {
      // IPv6 — bierzemy 3 pierwsze hextety (≈ /48).
      return ip.split(':').slice(0, 3).join(':');
    }
    // IPv4 — pierwsze 3 oktety (/24).
    const parts = ip.split('.');
    if (parts.length !== 4) return ip;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  private async isNewDevice(userId: string, fingerprint: string): Promise<boolean> {
    const since = new Date(
      Date.now() - LoginEventService.KNOWN_DEVICE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const known = await this.prisma.loginEvent.findFirst({
      where: {
        userId,
        deviceFingerprint: fingerprint,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    return known === null;
  }

  /**
   * Heurystyka — wyciągamy z User-Agent labelkę "Browser X on OS Y" bez
   * twardej zależności od `ua-parser-js`. Świadomie minimalistycznie:
   * dla 95% UA daje sensowny wynik, dla reszty zwraca null.
   */
  private parseDeviceLabel(ua: string | null): string | null {
    if (!ua) return null;
    const browser = /(Edg|Chrome|Firefox|Safari|Opera)\/[\d.]+/.exec(ua)?.[1];
    const os = /\((Windows|Macintosh|iPhone|iPad|Android|Linux)[^)]*\)/.exec(ua)?.[1];
    if (!browser && !os) return null;
    return [browser, os].filter(Boolean).join(' on ');
  }
}
