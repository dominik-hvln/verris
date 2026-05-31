import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  PLATFORM_SETTING_DEFAULTS,
  PLATFORM_SETTING_KEYS,
  type PlatformSettingKey,
} from './platform-settings.keys';

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
