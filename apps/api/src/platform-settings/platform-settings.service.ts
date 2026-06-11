import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  PLATFORM_SETTING_DEFAULTS,
  PLATFORM_SETTING_KEYS,
  type PlatformSettingKey,
} from './platform-settings.keys';

export interface SellerCompanyDto {
  name: string;
  nip: string;
  regon: string;
  krs: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  bankAccount: string;
}

export interface KsefSettingsDto {
  enabled: boolean;
  env: 'test' | 'prod';
  nip: string;
  tokenSet: boolean;
  publicKeySet: boolean;
}

export interface KsefRuntimeConfig {
  enabled: boolean;
  env: 'test' | 'prod';
  nip: string;
  token: string;
  publicKeyPem: string;
}

export type ClientPlatformConfigDto = {
  ecoPointsPerTree: number;
  ecoBadgeImpressionsPerPoint: number;
  ecoPointsPer10Credits: number;
  clientIdleSessionMinutes: number;
};

export type StaffSessionConfigDto = {
  staffIdleSessionMinutes: number;
};

export type AdminSessionConfigDto = {
  adminIdleSessionMinutes: number;
};

export type AdminPlatformSettingsDto = {
  ecoPointsPerTree: number;
  ecoBadgeImpressionsPerPoint: number;
  ecoPointsPer10Credits: number;
  clientIdleSessionMinutes: number;
  staffIdleSessionMinutes: number;
  adminIdleSessionMinutes: number;
};

@Injectable()
export class PlatformSettingsService {
  private cache: Map<string, string> | null = null;
  private cacheAt = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  async getStaffSessionConfig(): Promise<StaffSessionConfigDto> {
    const map = await this.loadMap();
    return {
      staffIdleSessionMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.STAFF_IDLE_MINUTES,
        30,
        5,
        24 * 60,
      ),
    };
  }

  async getAdminSessionConfig(): Promise<AdminSessionConfigDto> {
    const map = await this.loadMap();
    return {
      adminIdleSessionMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.ADMIN_IDLE_MINUTES,
        15,
        5,
        24 * 60,
      ),
    };
  }

  async getClientConfig(): Promise<ClientPlatformConfigDto> {
    const map = await this.loadMap();
    return {
      ecoPointsPerTree: this.readInt(map, PLATFORM_SETTING_KEYS.ECO_POINTS_PER_TREE, 1000, 1, 1_000_000),
      ecoBadgeImpressionsPerPoint: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.ECO_BADGE_IMPRESSIONS_PER_POINT,
        100,
        1,
        1_000_000,
      ),
      ecoPointsPer10Credits: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.ECO_POINTS_PER_10_CREDITS,
        100,
        1,
        100_000,
      ),
      clientIdleSessionMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.CLIENT_IDLE_MINUTES,
        60,
        5,
        24 * 60,
      ),
    };
  }

  async getAdminSettings(): Promise<AdminPlatformSettingsDto> {
    const map = await this.loadMap();
    return {
      ecoPointsPerTree: this.readInt(map, PLATFORM_SETTING_KEYS.ECO_POINTS_PER_TREE, 1000, 1, 1_000_000),
      ecoBadgeImpressionsPerPoint: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.ECO_BADGE_IMPRESSIONS_PER_POINT,
        100,
        1,
        1_000_000,
      ),
      ecoPointsPer10Credits: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.ECO_POINTS_PER_10_CREDITS,
        100,
        1,
        100_000,
      ),
      clientIdleSessionMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.CLIENT_IDLE_MINUTES,
        60,
        5,
        24 * 60,
      ),
      staffIdleSessionMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.STAFF_IDLE_MINUTES,
        30,
        5,
        24 * 60,
      ),
      adminIdleSessionMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.ADMIN_IDLE_MINUTES,
        15,
        5,
        24 * 60,
      ),
    };
  }

  async updateAdminSettings(
    input: AdminPlatformSettingsDto,
    actorUserId: string,
  ): Promise<AdminPlatformSettingsDto> {
    const entries: Array<[PlatformSettingKey, string]> = [
      [PLATFORM_SETTING_KEYS.ECO_POINTS_PER_TREE, String(input.ecoPointsPerTree)],
      [PLATFORM_SETTING_KEYS.ECO_BADGE_IMPRESSIONS_PER_POINT, String(input.ecoBadgeImpressionsPerPoint)],
      [PLATFORM_SETTING_KEYS.ECO_POINTS_PER_10_CREDITS, String(input.ecoPointsPer10Credits)],
      [PLATFORM_SETTING_KEYS.CLIENT_IDLE_MINUTES, String(input.clientIdleSessionMinutes)],
      [PLATFORM_SETTING_KEYS.STAFF_IDLE_MINUTES, String(input.staffIdleSessionMinutes)],
      [PLATFORM_SETTING_KEYS.ADMIN_IDLE_MINUTES, String(input.adminIdleSessionMinutes)],
    ];

    for (const [, raw] of entries) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new BadRequestException('Wartości ustawień muszą być dodatnimi liczbami całkowitymi.');
      }
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

    this.invalidateCache();

    await this.audit.record({
      action: 'PLATFORM_SETTINGS_UPDATED',
      userId: actorUserId,
      details: input,
    });

    return this.getAdminSettings();
  }

  /**
   * Platform-default authoritative nameservers for provisioned hosting accounts.
   * Resolution: PlatformSetting `hosting.ns*` → env `HOSTING_NS*` → empty.
   * Per-node overrides (Server.ns1/2/3) take precedence in ServersService.
   */
  async getHostingNameservers(): Promise<{ ns1: string; ns2: string; ns3: string }> {
    const map = await this.loadMap();
    return {
      ns1: this.readStr(map, PLATFORM_SETTING_KEYS.HOSTING_NS1, process.env.HOSTING_NS1 ?? ''),
      ns2: this.readStr(map, PLATFORM_SETTING_KEYS.HOSTING_NS2, process.env.HOSTING_NS2 ?? ''),
      ns3: this.readStr(map, PLATFORM_SETTING_KEYS.HOSTING_NS3, process.env.HOSTING_NS3 ?? ''),
    };
  }

  async updateHostingNameservers(
    input: { ns1?: string; ns2?: string; ns3?: string },
    actorUserId: string,
  ): Promise<{ ns1: string; ns2: string; ns3: string }> {
    const entries: Array<[PlatformSettingKey, string]> = [
      [PLATFORM_SETTING_KEYS.HOSTING_NS1, normaliseHostname(input.ns1)],
      [PLATFORM_SETTING_KEYS.HOSTING_NS2, normaliseHostname(input.ns2)],
      [PLATFORM_SETTING_KEYS.HOSTING_NS3, normaliseHostname(input.ns3)],
    ];
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedByUserId: actorUserId },
          update: { value, updatedByUserId: actorUserId },
        }),
      ),
    );
    this.invalidateCache();
    await this.audit.record({
      action: 'PLATFORM_NAMESERVERS_UPDATED',
      userId: actorUserId,
      details: { ns1: entries[0][1], ns2: entries[1][1], ns3: entries[2][1] },
    });
    return this.getHostingNameservers();
  }

  async getIdleMinutesForRole(role: string): Promise<number> {
    const map = await this.loadMap();
    if (role === 'ADMIN') {
      return this.readInt(map, PLATFORM_SETTING_KEYS.ADMIN_IDLE_MINUTES, 15, 5, 24 * 60);
    }
    if (role === 'STAFF') {
      return this.readInt(map, PLATFORM_SETTING_KEYS.STAFF_IDLE_MINUTES, 30, 5, 24 * 60);
    }
    return this.readInt(map, PLATFORM_SETTING_KEYS.CLIENT_IDLE_MINUTES, 60, 5, 24 * 60);
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
    const rows = await this.prisma.platformSetting.findMany();
    const map = new Map<string, string>(Object.entries(PLATFORM_SETTING_DEFAULTS));
    for (const row of rows) {
      map.set(row.key, row.value);
    }
    this.cache = map;
    this.cacheAt = now;
    return map;
  }

  private readInt(
    map: Map<string, string>,
    key: PlatformSettingKey,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = map.get(key) ?? String(fallback);
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  private readStr(map: Map<string, string>, key: PlatformSettingKey, fallback: string): string {
    const raw = map.get(key);
    return raw && raw.trim() ? raw.trim() : fallback;
  }

  // ---------------------------------------------------------------------------
  // Dane sprzedawcy (faktury) — DB → env fallback
  // ---------------------------------------------------------------------------

  async getSellerCompany(): Promise<SellerCompanyDto> {
    const map = await this.loadMap();
    const K = PLATFORM_SETTING_KEYS;
    return {
      name: this.readStr(map, K.COMPANY_NAME, process.env.VERRIS_COMPANY_NAME ?? ''),
      nip: this.readStr(map, K.COMPANY_NIP, process.env.VERRIS_COMPANY_NIP ?? ''),
      regon: this.readStr(map, K.COMPANY_REGON, process.env.VERRIS_COMPANY_REGON ?? ''),
      krs: this.readStr(map, K.COMPANY_KRS, process.env.VERRIS_COMPANY_KRS ?? ''),
      address: this.readStr(map, K.COMPANY_ADDRESS, process.env.VERRIS_COMPANY_ADDRESS ?? ''),
      city: this.readStr(map, K.COMPANY_CITY, process.env.VERRIS_COMPANY_CITY ?? ''),
      postalCode: this.readStr(map, K.COMPANY_POSTAL, process.env.VERRIS_COMPANY_POSTAL ?? ''),
      country: this.readStr(map, K.COMPANY_COUNTRY, process.env.VERRIS_COMPANY_COUNTRY ?? 'PL'),
      email: this.readStr(map, K.COMPANY_EMAIL, process.env.VERRIS_COMPANY_EMAIL ?? ''),
      bankAccount: this.readStr(
        map,
        K.COMPANY_BANK_ACCOUNT,
        process.env.VERRIS_COMPANY_BANK_ACCOUNT ?? '',
      ),
    };
  }

  async updateSellerCompany(input: SellerCompanyDto, actorUserId: string): Promise<SellerCompanyDto> {
    const nip = (input.nip ?? '').replace(/\D/g, '');
    if (nip && nip.length !== 10) {
      throw new BadRequestException('NIP musi mieć 10 cyfr.');
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('Nazwa firmy jest wymagana.');
    }
    const K = PLATFORM_SETTING_KEYS;
    const entries: Array<[PlatformSettingKey, string]> = [
      [K.COMPANY_NAME, input.name.trim()],
      [K.COMPANY_NIP, nip],
      [K.COMPANY_REGON, (input.regon ?? '').trim()],
      [K.COMPANY_KRS, (input.krs ?? '').trim()],
      [K.COMPANY_ADDRESS, (input.address ?? '').trim()],
      [K.COMPANY_CITY, (input.city ?? '').trim()],
      [K.COMPANY_POSTAL, (input.postalCode ?? '').trim()],
      [K.COMPANY_COUNTRY, (input.country ?? 'PL').trim().toUpperCase().slice(0, 2)],
      [K.COMPANY_EMAIL, (input.email ?? '').trim()],
      [K.COMPANY_BANK_ACCOUNT, (input.bankAccount ?? '').trim()],
    ];
    await this.upsertMany(entries, actorUserId);
    await this.audit.record({
      action: 'COMPANY_SELLER_DATA_UPDATED',
      userId: actorUserId,
      details: { name: input.name, nip },
    });
    return this.getSellerCompany();
  }

  // ---------------------------------------------------------------------------
  // KSeF — konfiguracja (sekrety szyfrowane KMS)
  // ---------------------------------------------------------------------------

  async getKsefSettings(): Promise<KsefSettingsDto> {
    const map = await this.loadMap();
    const K = PLATFORM_SETTING_KEYS;
    return {
      enabled: this.readStr(map, K.KSEF_ENABLED, process.env.KSEF_ENABLED ?? '0') === '1',
      env: (this.readStr(map, K.KSEF_ENV, process.env.KSEF_ENV ?? 'test') === 'prod'
        ? 'prod'
        : 'test') as 'test' | 'prod',
      nip: this.readStr(map, K.KSEF_NIP, process.env.KSEF_NIP ?? ''),
      tokenSet: Boolean(map.get(K.KSEF_TOKEN_ENC) || process.env.KSEF_TOKEN),
      publicKeySet: Boolean(map.get(K.KSEF_PUBLIC_KEY_ENC) || process.env.KSEF_PUBLIC_KEY_PEM_B64),
    };
  }

  /** Pełna konfiguracja runtime (z odszyfrowanymi sekretami) — tylko dla KsefService. */
  async getKsefRuntimeConfig(): Promise<KsefRuntimeConfig> {
    const map = await this.loadMap();
    const K = PLATFORM_SETTING_KEYS;
    const tokenEnc = map.get(K.KSEF_TOKEN_ENC) ?? '';
    const keyEnc = map.get(K.KSEF_PUBLIC_KEY_ENC) ?? '';
    let token = '';
    let publicKeyPem = '';
    try {
      token = tokenEnc ? this.crypto.decrypt(tokenEnc) : process.env.KSEF_TOKEN ?? '';
    } catch {
      token = '';
    }
    try {
      publicKeyPem = keyEnc
        ? this.crypto.decrypt(keyEnc)
        : process.env.KSEF_PUBLIC_KEY_PEM_B64
          ? Buffer.from(process.env.KSEF_PUBLIC_KEY_PEM_B64, 'base64').toString('utf8')
          : '';
    } catch {
      publicKeyPem = '';
    }
    return {
      enabled: this.readStr(map, K.KSEF_ENABLED, process.env.KSEF_ENABLED ?? '0') === '1',
      env: (this.readStr(map, K.KSEF_ENV, process.env.KSEF_ENV ?? 'test') === 'prod'
        ? 'prod'
        : 'test') as 'test' | 'prod',
      nip: this.readStr(map, K.KSEF_NIP, process.env.KSEF_NIP ?? ''),
      token,
      publicKeyPem,
    };
  }

  async updateKsefSettings(
    input: {
      enabled: boolean;
      env: 'test' | 'prod';
      nip: string;
      /** Nowy token — gdy puste, zachowujemy obecny. */
      token?: string;
      /** Nowy klucz publiczny PEM — gdy puste, zachowujemy obecny. */
      publicKeyPem?: string;
    },
    actorUserId: string,
  ): Promise<KsefSettingsDto> {
    const nip = (input.nip ?? '').replace(/\D/g, '');
    if (input.enabled && nip.length !== 10) {
      throw new BadRequestException('KSeF: NIP (10 cyfr) jest wymagany przy włączeniu.');
    }
    const K = PLATFORM_SETTING_KEYS;
    const entries: Array<[PlatformSettingKey, string]> = [
      [K.KSEF_ENABLED, input.enabled ? '1' : '0'],
      [K.KSEF_ENV, input.env === 'prod' ? 'prod' : 'test'],
      [K.KSEF_NIP, nip],
    ];
    if (input.token && input.token.trim()) {
      entries.push([K.KSEF_TOKEN_ENC, this.crypto.encrypt(input.token.trim())]);
    }
    if (input.publicKeyPem && input.publicKeyPem.trim()) {
      const pem = input.publicKeyPem.trim();
      if (!/-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|CERTIFICATE)-----/.test(pem)) {
        throw new BadRequestException('Klucz publiczny KSeF musi być w formacie PEM.');
      }
      entries.push([K.KSEF_PUBLIC_KEY_ENC, this.crypto.encrypt(pem)]);
    }
    await this.upsertMany(entries, actorUserId);
    await this.audit.record({
      action: 'KSEF_SETTINGS_UPDATED',
      userId: actorUserId,
      details: {
        enabled: input.enabled,
        env: input.env,
        nip,
        tokenChanged: Boolean(input.token),
        publicKeyChanged: Boolean(input.publicKeyPem),
      },
    });
    return this.getKsefSettings();
  }

  private async upsertMany(
    entries: Array<[PlatformSettingKey, string]>,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedByUserId: actorUserId },
          update: { value, updatedByUserId: actorUserId },
        }),
      ),
    );
    this.invalidateCache();
  }
}

/** Lowercases + strips a hostname; empty when blank or syntactically invalid. */
function normaliseHostname(raw?: string): string {
  const v = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!v) return '';
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(v)) {
    throw new BadRequestException(`Nieprawidłowy hostname serwera nazw: "${raw}".`);
  }
  return v;
}
