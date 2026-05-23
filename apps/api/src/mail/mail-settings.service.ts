import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import {
  MAIL_SETTING_DEFAULTS,
  MAIL_SETTING_KEYS,
  type MailSmtpSecure,
  type MailTransportMode,
} from './mail-settings.keys';
import {
  buildSmtpMailerProvider,
  isLocalSmtpHost,
  type ResolvedSmtpConfig,
} from './mail-smtp.factory';
import type { MailerProvider } from './mailer.interface';
import type {
  AdminMailSettingsResponseDto,
  UpdateMailSettingsDto,
} from './dto/mail-settings.dto';

@Injectable()
export class MailSettingsService {
  private cache: Map<string, string> | null = null;
  private cacheAt = 0;
  private readonly cacheTtlMs = 15_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async getAdminSettings(): Promise<AdminMailSettingsResponseDto> {
    const map = await this.loadMap();
    const transport = this.readTransport(map);
    const resolved = this.resolveSmtpConfig(map);

    return {
      transport,
      fromAddress: resolved.fromAddress,
      fromName: resolved.fromName,
      smtpHost: transport === 'external' ? resolved.host : 'localhost',
      smtpPort: transport === 'external' ? resolved.port : 25,
      smtpSecure: resolved.secure,
      smtpUser: map.get(MAIL_SETTING_KEYS.SMTP_USER) ?? '',
      smtpPasswordConfigured: Boolean(map.get(MAIL_SETTING_KEYS.SMTP_PASS_ENC)?.trim()),
    };
  }

  async updateAdminSettings(
    input: UpdateMailSettingsDto,
    actorUserId: string,
  ): Promise<AdminMailSettingsResponseDto> {
    if (input.transport === 'external') {
      if (!input.smtpHost?.trim()) {
        throw new BadRequestException('Podaj host SMTP dla trybu zewnętrznego.');
      }
      const local = isLocalSmtpHost(input.smtpHost.trim());
      if (!local && !input.smtpUser?.trim()) {
        throw new BadRequestException('Zewnętrzny relay wymaga użytkownika SMTP.');
      }
      const map = await this.loadMap();
      const hasPass =
        Boolean(input.smtpPassword?.trim()) ||
        Boolean(map.get(MAIL_SETTING_KEYS.SMTP_PASS_ENC)?.trim());
      if (!local && !hasPass) {
        throw new BadRequestException('Zewnętrzny relay wymaga hasła SMTP.');
      }
    }

    const entries: Array<[string, string]> = [
      [MAIL_SETTING_KEYS.TRANSPORT, input.transport],
      [MAIL_SETTING_KEYS.FROM_ADDRESS, input.fromAddress.trim()],
      [MAIL_SETTING_KEYS.FROM_NAME, input.fromName.trim()],
    ];

    if (input.transport === 'external') {
      entries.push(
        [MAIL_SETTING_KEYS.SMTP_HOST, input.smtpHost.trim()],
        [MAIL_SETTING_KEYS.SMTP_PORT, String(input.smtpPort)],
        [MAIL_SETTING_KEYS.SMTP_SECURE, input.smtpSecure],
        [MAIL_SETTING_KEYS.SMTP_USER, (input.smtpUser ?? '').trim()],
      );
    } else {
      entries.push(
        [MAIL_SETTING_KEYS.SMTP_HOST, ''],
        [MAIL_SETTING_KEYS.SMTP_PORT, '25'],
        [MAIL_SETTING_KEYS.SMTP_SECURE, 'none'],
        [MAIL_SETTING_KEYS.SMTP_USER, ''],
        [MAIL_SETTING_KEYS.SMTP_PASS_ENC, ''],
      );
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedByUserId: actorUserId },
          update: { value, updatedByUserId: actorUserId },
        }),
      ),
    );

    if (input.transport === 'external' && input.smtpPassword?.trim()) {
      const enc = this.crypto.encrypt(input.smtpPassword.trim());
      await this.prisma.platformSetting.upsert({
        where: { key: MAIL_SETTING_KEYS.SMTP_PASS_ENC },
        create: {
          key: MAIL_SETTING_KEYS.SMTP_PASS_ENC,
          value: enc,
          updatedByUserId: actorUserId,
        },
        update: { value: enc, updatedByUserId: actorUserId },
      });
    }

    this.invalidateCache();

    await this.audit.record({
      action: 'MAIL_SETTINGS_UPDATED',
      userId: actorUserId,
      details: {
        transport: input.transport,
        fromAddress: input.fromAddress,
        smtpHost: input.transport === 'external' ? input.smtpHost : 'localhost',
      },
    });

    return this.getAdminSettings();
  }

  async resolveProvider(): Promise<MailerProvider> {
    const map = await this.loadMap();
    return buildSmtpMailerProvider(this.resolveSmtpConfig(map));
  }

  resolveSmtpConfig(map?: Map<string, string>): ResolvedSmtpConfig {
    const m = map ?? new Map(Object.entries(MAIL_SETTING_DEFAULTS));
    const transport = this.readTransport(m);
    const fromAddress =
      m.get(MAIL_SETTING_KEYS.FROM_ADDRESS)?.trim() ||
      this.config.get<string>('SMTP_FROM_ADDRESS') ||
      process.env.SMTP_FROM_ADDRESS ||
      'noreply@verris.pl';
    const fromName =
      m.get(MAIL_SETTING_KEYS.FROM_NAME)?.trim() ||
      this.config.get<string>('SMTP_FROM_NAME') ||
      process.env.SMTP_FROM_NAME ||
      'Verris';

    if (transport === 'local') {
      const envHost =
        this.config.get<string>('SMTP_HOST') || process.env.SMTP_HOST || 'host.docker.internal';
      const envPort = parseInt(
        this.config.get<string>('SMTP_PORT') || process.env.SMTP_PORT || '25',
        10,
      );
      const secureRaw = (
        this.config.get<string>('SMTP_SECURE') ||
        process.env.SMTP_SECURE ||
        'none'
      ).toLowerCase() as MailSmtpSecure;

      return {
        host: isLocalSmtpHost(envHost) ? envHost : 'localhost',
        port: Number.isFinite(envPort) && envPort > 0 ? envPort : 25,
        username: '',
        password: '',
        fromAddress,
        fromName,
        secure: secureRaw === 'tls' || secureRaw === 'starttls' ? secureRaw : 'none',
      };
    }

    const host = m.get(MAIL_SETTING_KEYS.SMTP_HOST)?.trim() || '';
    const port = parseInt(m.get(MAIL_SETTING_KEYS.SMTP_PORT) ?? '587', 10);
    const secure = (m.get(MAIL_SETTING_KEYS.SMTP_SECURE) ?? 'starttls') as MailSmtpSecure;
    const username = m.get(MAIL_SETTING_KEYS.SMTP_USER)?.trim() ?? '';
    const passEnc = m.get(MAIL_SETTING_KEYS.SMTP_PASS_ENC)?.trim() ?? '';
    let password = '';
    if (passEnc) {
      try {
        password = this.crypto.decrypt(passEnc);
      } catch {
        password = '';
      }
    }

    return {
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      username,
      password,
      fromAddress,
      fromName,
      secure,
    };
  }

  private readTransport(map: Map<string, string>): MailTransportMode {
    const raw = map.get(MAIL_SETTING_KEYS.TRANSPORT) ?? 'local';
    return raw === 'external' ? 'external' : 'local';
  }

  private invalidateCache(): void {
    this.cache = null;
    this.cacheAt = 0;
  }

  private async loadMap(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < this.cacheTtlMs) {
      return this.cache;
    }
    const rows = await this.prisma.platformSetting.findMany({
      where: {
        key: { startsWith: 'mail.' },
      },
    });
    const map = new Map<string, string>(Object.entries(MAIL_SETTING_DEFAULTS));
    for (const row of rows) {
      map.set(row.key, row.value);
    }
    this.cache = map;
    this.cacheAt = now;
    return map;
  }
}
