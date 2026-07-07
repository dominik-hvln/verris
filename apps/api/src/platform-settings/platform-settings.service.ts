import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  PLATFORM_SETTING_DEFAULTS,
  PLATFORM_SETTING_KEYS,
  type PlatformSettingKey,
} from './platform-settings.keys';
import type { TrialOfferConfig } from './dto/trial-offer.dto';

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
  env: 'test' | 'demo' | 'prod';
  nip: string;
  tokenSet: boolean;
}

export interface KsefRuntimeConfig {
  enabled: boolean;
  env: 'test' | 'demo' | 'prod';
  nip: string;
  token: string;
}

export type ClientPlatformConfigDto = {
  ecoPointsPerTree: number;
  ecoBadgeImpressionsPerPoint: number;
  ecoPointsPer10Credits: number;
  clientIdleSessionMinutes: number;
  /** P-1 — custom-branded Roundcube webmail URL ('' = not configured). */
  webmailUrl: string;
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
      webmailUrl: this.readStr(
        map,
        PLATFORM_SETTING_KEYS.WEBMAIL_URL,
        (process.env.WEBMAIL_URL ?? '').trim(),
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

  // UX-3 — oferta okresu próbnego (czytana publicznie + edytowalna przez admina).
  async getTrialOffer(): Promise<TrialOfferConfig> {
    const map = await this.loadMap();
    return {
      freeEnabled: this.readStr(map, PLATFORM_SETTING_KEYS.TRIAL_FREE_ENABLED, '1') === '1',
      cardEnabled: this.readStr(map, PLATFORM_SETTING_KEYS.TRIAL_CARD_ENABLED, '1') === '1',
      annualDiscountPct: this.readInt(map, PLATFORM_SETTING_KEYS.TRIAL_ANNUAL_DISCOUNT_PCT, 15, 0, 90),
      monthlyDiscountPct: this.readInt(map, PLATFORM_SETTING_KEYS.TRIAL_MONTHLY_DISCOUNT_PCT, 10, 0, 90),
      annualPromoCode: this.readStr(map, PLATFORM_SETTING_KEYS.TRIAL_ANNUAL_PROMO_CODE, '').trim(),
      monthlyPromoCode: this.readStr(map, PLATFORM_SETTING_KEYS.TRIAL_MONTHLY_PROMO_CODE, '').trim(),
      introDiscountPeriods: this.readInt(map, PLATFORM_SETTING_KEYS.TRIAL_INTRO_PERIODS, 1, 1, 24),
    };
  }

  async updateTrialOffer(
    input: {
      freeEnabled: boolean;
      cardEnabled: boolean;
      annualDiscountPct: number;
      monthlyDiscountPct: number;
      annualPromoCode?: string;
      monthlyPromoCode?: string;
      introDiscountPeriods: number;
    },
    actorUserId: string,
  ): Promise<TrialOfferConfig> {
    const periods = Math.min(Math.max(Math.round(input.introDiscountPeriods) || 1, 1), 24);
    await this.upsertMany(
      [
        [PLATFORM_SETTING_KEYS.TRIAL_FREE_ENABLED, input.freeEnabled ? '1' : '0'],
        [PLATFORM_SETTING_KEYS.TRIAL_CARD_ENABLED, input.cardEnabled ? '1' : '0'],
        [PLATFORM_SETTING_KEYS.TRIAL_ANNUAL_DISCOUNT_PCT, String(input.annualDiscountPct)],
        [PLATFORM_SETTING_KEYS.TRIAL_MONTHLY_DISCOUNT_PCT, String(input.monthlyDiscountPct)],
        [PLATFORM_SETTING_KEYS.TRIAL_ANNUAL_PROMO_CODE, (input.annualPromoCode ?? '').trim()],
        [PLATFORM_SETTING_KEYS.TRIAL_MONTHLY_PROMO_CODE, (input.monthlyPromoCode ?? '').trim()],
        [PLATFORM_SETTING_KEYS.TRIAL_INTRO_PERIODS, String(periods)],
      ],
      actorUserId,
    );
    await this.audit.record({
      action: 'PLATFORM_TRIAL_OFFER_UPDATED',
      userId: actorUserId,
      details: { ...input },
    });
    return this.getTrialOffer();
  }

  // MON-3 — ustawienia monitoringu strony (interwały + cena płatnego tieru).
  async getMonitoringSettings(): Promise<{
    freeIntervalMinutes: number;
    paidIntervalMinutes: number;
    paidMonthlyPrice: number;
    paidOffered: boolean;
  }> {
    const map = await this.loadMap();
    return {
      freeIntervalMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.MONITORING_FREE_INTERVAL_MIN,
        30,
        1,
        1440,
      ),
      paidIntervalMinutes: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.MONITORING_PAID_INTERVAL_MIN,
        1,
        1,
        60,
      ),
      paidMonthlyPrice: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.MONITORING_PAID_PRICE,
        5,
        0,
        100000,
      ),
      paidOffered: this.readStr(map, PLATFORM_SETTING_KEYS.MONITORING_PAID_OFFERED, '1') === '1',
    };
  }

  async updateMonitoringSettings(
    input: {
      freeIntervalMinutes: number;
      paidIntervalMinutes: number;
      paidMonthlyPrice: number;
      paidOffered: boolean;
    },
    actorUserId: string,
  ): Promise<{
    freeIntervalMinutes: number;
    paidIntervalMinutes: number;
    paidMonthlyPrice: number;
    paidOffered: boolean;
  }> {
    const free = Math.min(Math.max(Math.round(input.freeIntervalMinutes) || 30, 1), 1440);
    const paid = Math.min(Math.max(Math.round(input.paidIntervalMinutes) || 1, 1), 60);
    const price = Math.min(Math.max(Math.round(input.paidMonthlyPrice) || 0, 0), 100000);
    await this.upsertMany(
      [
        [PLATFORM_SETTING_KEYS.MONITORING_FREE_INTERVAL_MIN, String(free)],
        [PLATFORM_SETTING_KEYS.MONITORING_PAID_INTERVAL_MIN, String(paid)],
        [PLATFORM_SETTING_KEYS.MONITORING_PAID_PRICE, String(price)],
        [PLATFORM_SETTING_KEYS.MONITORING_PAID_OFFERED, input.paidOffered ? '1' : '0'],
      ],
      actorUserId,
    );
    await this.audit.record({
      action: 'PLATFORM_MONITORING_SETTINGS_UPDATED',
      userId: actorUserId,
      details: { ...input },
    });
    return this.getMonitoringSettings();
  }

  // #11 — polityka kredytów SLA.
  async getSlaCreditPolicy(): Promise<{
    enabled: boolean;
    graceMinutes: number;
    multiplier: number;
    capPercent: number;
  }> {
    const map = await this.loadMap();
    return {
      enabled: this.readStr(map, PLATFORM_SETTING_KEYS.SLA_CREDITS_ENABLED, '0') === '1',
      graceMinutes: this.readInt(map, PLATFORM_SETTING_KEYS.SLA_GRACE_MINUTES, 5, 0, 1440),
      multiplier: this.readInt(map, PLATFORM_SETTING_KEYS.SLA_MULTIPLIER, 10, 1, 1000),
      capPercent: this.readInt(map, PLATFORM_SETTING_KEYS.SLA_CAP_PERCENT, 100, 1, 1000),
    };
  }

  async updateSlaCreditPolicy(
    input: { enabled: boolean; graceMinutes: number; multiplier: number; capPercent: number },
    actorUserId: string,
  ): Promise<{ enabled: boolean; graceMinutes: number; multiplier: number; capPercent: number }> {
    const grace = Math.min(Math.max(Math.round(input.graceMinutes) || 0, 0), 1440);
    const mult = Math.min(Math.max(Math.round(input.multiplier) || 1, 1), 1000);
    const cap = Math.min(Math.max(Math.round(input.capPercent) || 1, 1), 1000);
    await this.upsertMany(
      [
        [PLATFORM_SETTING_KEYS.SLA_CREDITS_ENABLED, input.enabled ? '1' : '0'],
        [PLATFORM_SETTING_KEYS.SLA_GRACE_MINUTES, String(grace)],
        [PLATFORM_SETTING_KEYS.SLA_MULTIPLIER, String(mult)],
        [PLATFORM_SETTING_KEYS.SLA_CAP_PERCENT, String(cap)],
      ],
      actorUserId,
    );
    await this.audit.record({
      action: 'PLATFORM_SLA_CREDIT_POLICY_UPDATED',
      userId: actorUserId,
      details: { ...input },
    });
    return this.getSlaCreditPolicy();
  }

  // ---------------------------------------------------------------------------
  // RESELL — program partnerski (afiliacja)
  // ---------------------------------------------------------------------------

  async getPartnerProgram(): Promise<{
    enabled: boolean;
    commissionPct: number;
    holdDays: number;
    minPayout: number;
    freeHostingThreshold: number;
    freeHostingCredit: number;
  }> {
    const map = await this.loadMap();
    return {
      enabled: this.readStr(map, PLATFORM_SETTING_KEYS.PARTNER_ENABLED, '1') === '1',
      commissionPct: this.readInt(map, PLATFORM_SETTING_KEYS.PARTNER_COMMISSION_PCT, 15, 0, 90),
      holdDays: this.readInt(map, PLATFORM_SETTING_KEYS.PARTNER_HOLD_DAYS, 30, 0, 365),
      minPayout: this.readInt(map, PLATFORM_SETTING_KEYS.PARTNER_MIN_PAYOUT, 100, 0, 100000),
      freeHostingThreshold: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.PARTNER_FREE_HOSTING_THRESHOLD,
        5,
        0,
        1000,
      ),
      freeHostingCredit: this.readInt(
        map,
        PLATFORM_SETTING_KEYS.PARTNER_FREE_HOSTING_CREDIT,
        50,
        0,
        100000,
      ),
    };
  }

  async updatePartnerProgram(
    input: {
      enabled: boolean;
      commissionPct: number;
      holdDays: number;
      minPayout: number;
      freeHostingThreshold: number;
      freeHostingCredit: number;
    },
    actorUserId: string,
  ): Promise<{
    enabled: boolean;
    commissionPct: number;
    holdDays: number;
    minPayout: number;
    freeHostingThreshold: number;
    freeHostingCredit: number;
  }> {
    const pct = Math.min(Math.max(Math.round(input.commissionPct) || 0, 0), 90);
    const hold = Math.min(Math.max(Math.round(input.holdDays) || 0, 0), 365);
    const minPayout = Math.min(Math.max(Math.round(input.minPayout) || 0, 0), 100000);
    const threshold = Math.min(Math.max(Math.round(input.freeHostingThreshold) || 0, 0), 1000);
    const credit = Math.min(Math.max(Math.round(input.freeHostingCredit) || 0, 0), 100000);
    await this.upsertMany(
      [
        [PLATFORM_SETTING_KEYS.PARTNER_ENABLED, input.enabled ? '1' : '0'],
        [PLATFORM_SETTING_KEYS.PARTNER_COMMISSION_PCT, String(pct)],
        [PLATFORM_SETTING_KEYS.PARTNER_HOLD_DAYS, String(hold)],
        [PLATFORM_SETTING_KEYS.PARTNER_MIN_PAYOUT, String(minPayout)],
        [PLATFORM_SETTING_KEYS.PARTNER_FREE_HOSTING_THRESHOLD, String(threshold)],
        [PLATFORM_SETTING_KEYS.PARTNER_FREE_HOSTING_CREDIT, String(credit)],
      ],
      actorUserId,
    );
    await this.audit.record({
      action: 'PLATFORM_PARTNER_PROGRAM_UPDATED',
      userId: actorUserId,
      details: { ...input },
    });
    return this.getPartnerProgram();
  }

  /**
   * Platform-default authoritative nameservers for provisioned hosting accounts.
   * Resolution: PlatformSetting `hosting.ns*` → env `HOSTING_NS*` → empty.
   * Per-node overrides (Server.ns1/2/3) take precedence in ServersService.
   */
  /** P-6 — PHP versions selectable by clients (platform setting, comma-separated). */
  async getAvailablePhpVersions(): Promise<string[]> {
    const map = await this.loadMap();
    const raw = this.readStr(
      map,
      PLATFORM_SETTING_KEYS.PHP_AVAILABLE_VERSIONS,
      '8.3,8.2,8.1,8.0,7.4',
    );
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => /^\d+\.\d+$/.test(v));
  }

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
      env: this.normalizeKsefEnv(this.readStr(map, K.KSEF_ENV, process.env.KSEF_ENV ?? 'test')),
      nip: this.readStr(map, K.KSEF_NIP, process.env.KSEF_NIP ?? ''),
      tokenSet: Boolean(map.get(K.KSEF_TOKEN_ENC) || process.env.KSEF_TOKEN),
    };
  }

  private normalizeKsefEnv(raw: string): 'test' | 'demo' | 'prod' {
    return raw === 'prod' ? 'prod' : raw === 'demo' ? 'demo' : 'test';
  }

  /** Pełna konfiguracja runtime (z odszyfrowanym tokenem) — tylko dla KsefService. */
  async getKsefRuntimeConfig(): Promise<KsefRuntimeConfig> {
    const map = await this.loadMap();
    const K = PLATFORM_SETTING_KEYS;
    const tokenEnc = map.get(K.KSEF_TOKEN_ENC) ?? '';
    let token = '';
    try {
      token = tokenEnc ? this.crypto.decrypt(tokenEnc) : process.env.KSEF_TOKEN ?? '';
    } catch {
      token = '';
    }
    return {
      enabled: this.readStr(map, K.KSEF_ENABLED, process.env.KSEF_ENABLED ?? '0') === '1',
      env: this.normalizeKsefEnv(this.readStr(map, K.KSEF_ENV, process.env.KSEF_ENV ?? 'test')),
      nip: this.readStr(map, K.KSEF_NIP, process.env.KSEF_NIP ?? ''),
      token,
    };
  }

  async updateKsefSettings(
    input: {
      enabled: boolean;
      env: 'test' | 'demo' | 'prod';
      nip: string;
      /** Nowy token KSeF — gdy puste, zachowujemy obecny. */
      token?: string;
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
      [K.KSEF_ENV, this.normalizeKsefEnv(input.env)],
      [K.KSEF_NIP, nip],
    ];
    if (input.token && input.token.trim()) {
      entries.push([K.KSEF_TOKEN_ENC, this.crypto.encrypt(input.token.trim())]);
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
