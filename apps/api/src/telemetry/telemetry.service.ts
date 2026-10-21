import { Injectable, Logger, Optional } from '@nestjs/common';
import { Account, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudLinuxTelemetryDto } from './telemetry.dto.js';
import { raportDoZapisu } from './faulty-lve.js';
import { AlarmyService } from '../alarmy/alarmy.service.js';
import {
  noweDoAlarmu,
  oczyscRaportAktualizacji,
  stanAktualizacjiZBazy,
  trescAlarmuCustomBuild,
  trescAlarmuPoprawek,
} from './aktualizacje-wezla.js';

/** Alarm o tej samej poprawce na tym samym węźle najwyżej raz na 7 dni. */
const COOLDOWN_ALARMU_AKTUALIZACJI_MIN = 7 * 24 * 60;

const DEFAULT_BUCKET_S = 60;
const MIN_BUCKET_S = 15;
const MAX_BUCKET_S = 86_400;

interface ProcessResult {
  received: true;
  processedAccounts: number;
  persistedSamples: number;
  unknownAccounts: number;
  bucketStart: string;
  bucketDurationS: number;
}

/**
 * Receives bucketed CloudLinux LVE samples from compute nodes and persists
 * them as `UsageMetric` rows.
 *
 * Idempotency is enforced by the unique key
 * `(subscriptionId, bucketStart, bucketDurationS)`: if the agent retries the
 * same batch we just no-op the duplicates.
 *
 * Unknown DA usernames (no matching `Account`) are tolerated — they're logged
 * and counted but do not break the batch (e.g. orphan accounts from manual
 * cleanups, or system users like `webapps`).
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    // 21.10 — alarmy o nowych poprawkach bezpieczeństwa (moduł globalny; w testach bez niego — bez alarmów).
    @Optional() private readonly alarmy?: AlarmyService,
  ) {}

  async processLveMetrics(
    data: CloudLinuxTelemetryDto & { serverId: string },
  ): Promise<ProcessResult> {
    const bucketDurationS = clampBucket(data.bucketDurationS ?? DEFAULT_BUCKET_S);
    const bucketStart = resolveBucketStart(data.bucketStart, bucketDurationS);

    this.logger.log(
      `Telemetry batch from server=${data.serverId} accounts=${data.accounts.length} ` +
        `bucket=${bucketStart.toISOString()} duration=${bucketDurationS}s`,
    );

    // 21.10 — raport aktualizacji: poprzedni stan potrzebny do wykrycia NOWYCH poprawek (alarm tylko o nich).
    const aktualizacje = data.aktualizacje !== undefined ? oczyscRaportAktualizacji(data.aktualizacje) : null;
    const poprzednieAktualizacje = aktualizacje
      ? await this.prisma.server.findUnique({ where: { id: data.serverId }, select: { aktualizacje: true, name: true, hostname: true } })
      : null;
    if (data.aktualizacje !== undefined && !aktualizacje) {
      this.logger.warn(`Nieczytelny raport aktualizacji z server=${data.serverId} — pominięty`);
    }

    await this.prisma.server.update({
      where: { id: data.serverId },
      data: {
        lastHeartbeatAt: new Date(),
        // 21.10 — raport aktualizacji nadpisuje poprzedni (także z błędem dnf); bez bloku zostaje ostatni.
        ...(aktualizacje
          ? { aktualizacje: aktualizacje as unknown as Prisma.InputJsonValue, aktualizacjeAt: new Date() }
          : {}),
        agentVersion: data.agentVersion ?? undefined,
        // F2.6 — raport faultów nadpisuje poprzedni (także błędem narzędzia); bez bloku — zostaje ostatni raport.
        ...(data.faults
          ? { lveFaults: raportDoZapisu(data.faults) as unknown as Prisma.InputJsonValue, lveFaultsAt: new Date() }
          : {}),
        ...(data.node
          ? {
              cagefsEnabled: data.node.cagefsEnabled ?? null,
              cagefsEnabledCount: data.node.cagefsEnabledCount ?? null,
              cagefsCheckedAt: new Date(),
              // F3.4 — watchdog usług: ostatni raport nadpisuje poprzedni; bez bloku zostaje ostatni (i jego czas).
              ...(data.node.services
                ? {
                    uslugiStan: data.node.services.map((u) => ({ k: u.k, s: u.s, ...(u.e ? { e: u.e } : {}) })) as unknown as Prisma.InputJsonValue,
                    uslugiStanAt: new Date(),
                  }
                : {}),
              ...(data.node.hardened !== undefined
                ? { hardenedEnabled: data.node.hardened, hardenedCheckedAt: new Date() }
                : {}),
              // NODE-03 — pojemność odświeżana z telemetrii; wcześniej tylko handshake,
              // więc rozbudowa węzła nigdy nie docierała do selektora węzłów.
              ...(data.node.totalCpuCores ? { totalCpuCores: data.node.totalCpuCores } : {}),
              ...(data.node.totalMemoryMb ? { totalMemoryMb: data.node.totalMemoryMb } : {}),
              ...(data.node.totalDiskMb ? { totalDiskMb: data.node.totalDiskMb } : {}),
              // PB-30 — wersje stosu (raport zgodności floty z manifestem).
              ...(data.node.stackVersion || data.node.daVersion || data.node.lsVersion || data.node.phpVersion || data.node.clVersion
                ? {
                    stackVersion: data.node.stackVersion ?? null,
                    daVersion: data.node.daVersion ?? null,
                    lsVersion: data.node.lsVersion ?? null,
                    clVersion: data.node.clVersion ?? null,
                    phpDefaultVersion: data.node.phpVersion ?? null,
                    versionsCheckedAt: new Date(),
                  }
                : {}),
              // DB-1 — silnik+wersja bazy z agenta (3306 zamknięty z control-plane).
              ...(data.node.dbEngine || data.node.dbVersion
                ? {
                    dbEngine: data.node.dbEngine ?? null,
                    dbVersion: data.node.dbVersion ?? null,
                    dbCheckedAt: new Date(),
                  }
                : {}),
            }
          : {}),
      },
    });

    if (aktualizacje && poprzednieAktualizacje) {
      await this.alarmujONowychAktualizacjach(
        data.serverId,
        poprzednieAktualizacje.name ?? poprzednieAktualizacje.hostname ?? data.serverId,
        stanAktualizacjiZBazy(poprzednieAktualizacje.aktualizacje),
        aktualizacje,
      );
    }

    if (data.accounts.length === 0) {
      return {
        received: true,
        processedAccounts: 0,
        persistedSamples: 0,
        unknownAccounts: 0,
        bucketStart: bucketStart.toISOString(),
        bucketDurationS,
      };
    }

    const usernames = Array.from(new Set(data.accounts.map((a) => a.username)));
    const accounts = await this.prisma.account.findMany({
      where: { daUsername: { in: usernames }, serverId: data.serverId },
    });
    const accountByUsername = new Map<string, Account>(
      accounts.map((a) => [a.daUsername, a]),
    );

    let persisted = 0;
    let unknown = 0;

    // Push samples one-by-one (small N — typically tens-to-low-hundreds per
    // node per batch) so a single bad row doesn't kill the whole batch.
    for (const sample of data.accounts) {
      const account = accountByUsername.get(sample.username);
      if (!account) {
        unknown += 1;
        continue;
      }

      try {
        await this.prisma.usageMetric.upsert({
          where: {
            subscriptionId_bucketStart_bucketDurationS: {
              subscriptionId: account.subscriptionId,
              bucketStart,
              bucketDurationS,
            },
          },
          update: {
            cpuUsageAvg: sample.cpuUsagePercent,
            cpuUsageMax: sample.cpuUsageMaxPercent ?? sample.cpuUsagePercent,
            memUsageAvgMb: sample.memUsageMb,
            memUsageMaxMb: sample.memUsageMaxMb ?? sample.memUsageMb,
            diskUsageMb: sample.diskUsageMb,
            ioUsageKbps: sample.ioUsageKbps ?? 0,
          },
          create: {
            subscriptionId: account.subscriptionId,
            accountId: account.id,
            serverId: data.serverId,
            bucketStart,
            bucketDurationS,
            cpuUsageAvg: sample.cpuUsagePercent,
            cpuUsageMax: sample.cpuUsageMaxPercent ?? sample.cpuUsagePercent,
            memUsageAvgMb: sample.memUsageMb,
            memUsageMaxMb: sample.memUsageMaxMb ?? sample.memUsageMb,
            diskUsageMb: sample.diskUsageMb,
            ioUsageKbps: sample.ioUsageKbps ?? 0,
          },
        });
        persisted += 1;
      } catch (err) {
        // Most likely a transient DB error — record but don't fail the batch.
        const e = err as Error & { code?: string };
        this.logger.warn(
          `Failed to persist usage sample for ${sample.username} (server=${data.serverId}): ` +
            `${e.code ?? ''} ${e.message}`,
        );
      }
    }

    if (unknown > 0) {
      this.logger.debug(
        `Skipped ${unknown} unknown DA username(s) on server=${data.serverId}: ` +
          usernames
            .filter((u) => !accountByUsername.has(u))
            .slice(0, 10)
            .join(', '),
      );
    }

    return {
      received: true,
      processedAccounts: data.accounts.length,
      persistedSamples: persisted,
      unknownAccounts: unknown,
      bucketStart: bucketStart.toISOString(),
      bucketDurationS,
    };
  }

  /**
   * 21.10 — alarm (panel + e-mail + push) o NOWYCH poprawkach o wadze Critical/Important i o nowych wersjach składników
   * CustomBuild. Klucz z posortowanych advisory: ten sam zestaw drugi raz w ciągu 7 dni nie alarmuje. Błąd kanału alarmu
   * nie psuje zapisu telemetrii.
   */
  private async alarmujONowychAktualizacjach(
    serverId: string,
    wezel: string,
    poprzedni: ReturnType<typeof stanAktualizacjiZBazy>,
    obecny: NonNullable<ReturnType<typeof oczyscRaportAktualizacji>>,
  ) {
    if (!this.alarmy) return;
    const nowe = noweDoAlarmu(poprzedni, obecny);
    try {
      if (nowe.poprawki.length) {
        const advisory = Array.from(new Set(nowe.poprawki.map((p) => p.advisory))).sort();
        const { tytul, tresc } = trescAlarmuPoprawek(wezel, nowe.poprawki);
        await this.alarmy.wyslij({
          klucz: `aktualizacje:${serverId}:${advisory.join(',')}`.slice(0, 500),
          tytul,
          tresc,
          link: '/nodes/aktualizacje',
          waga: nowe.poprawki.some((p) => p.waga === 'Critical') ? 'krytyczny' : 'ostrzezenie',
          cooldownMin: COOLDOWN_ALARMU_AKTUALIZACJI_MIN,
        });
      }
      if (nowe.custombuild.length) {
        const sklad = nowe.custombuild.map((c) => `${c.nazwa}@${c.na}`).sort();
        const { tytul, tresc } = trescAlarmuCustomBuild(wezel, nowe.custombuild);
        await this.alarmy.wyslij({
          klucz: `aktualizacje:${serverId}:custombuild:${sklad.join(',')}`.slice(0, 500),
          tytul,
          tresc,
          link: '/nodes/aktualizacje',
          waga: 'info',
          cooldownMin: COOLDOWN_ALARMU_AKTUALIZACJI_MIN,
        });
      }
    } catch (err) {
      this.logger.error(`Alarm o aktualizacjach server=${serverId}: ${(err as Error).message}`);
    }
  }

  /**
   * Returns the latest N buckets for a single subscription. Used by the
   * client panel "service detail" page and by the autoscaling engine.
   */
  async getRecentForSubscription(subscriptionId: string, limit = 60) {
    return this.prisma.usageMetric.findMany({
      where: { subscriptionId },
      orderBy: { bucketStart: 'desc' },
      take: limit,
    });
  }
}

function clampBucket(value: number): number {
  if (value < MIN_BUCKET_S) return MIN_BUCKET_S;
  if (value > MAX_BUCKET_S) return MAX_BUCKET_S;
  return Math.round(value);
}

/**
 * Bucket start is normalised to a multiple of `bucketDurationS` UTC seconds —
 * keeps buckets aligned across all nodes regardless of when the agent fires.
 */
function resolveBucketStart(input: string | undefined, durationS: number): Date {
  const candidate = input ? new Date(input) : new Date(Date.now() - durationS * 1000);
  if (Number.isNaN(candidate.getTime())) {
    return alignToBucket(new Date(Date.now() - durationS * 1000), durationS);
  }
  return alignToBucket(candidate, durationS);
}

function alignToBucket(date: Date, durationS: number): Date {
  const ms = durationS * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

// Suppress unused warning — Prisma typings are imported for the relations.
void Prisma;
