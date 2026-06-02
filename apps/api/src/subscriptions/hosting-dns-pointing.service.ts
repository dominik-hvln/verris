import { Injectable, NotFoundException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

export type DnsPointingStatus = 'ok' | 'partial' | 'fail' | 'pending';

export interface HostingDnsPointingResult {
  domain: string | null;
  expectedIpv4: string | null;
  serverName: string | null;
  expectedNameservers: string[];
  observedA: string[];
  observedAaaa: string[];
  observedWwwA: string[];
  nameservers: string[];
  delegatedToExpectedNs: boolean;
  pointsToServer: boolean;
  wwwPointsToServer: boolean | null;
  status: DnsPointingStatus;
  message: string;
  issues: string[];
  checkedAt: string;
}

@Injectable()
export class HostingDnsPointingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async verifyForSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<HostingDnsPointingResult> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');

    if (!sub.account) {
      return {
        domain: null,
        expectedIpv4: null,
        serverName: null,
        expectedNameservers: [],
        observedA: [],
        observedAaaa: [],
        observedWwwA: [],
        nameservers: [],
        delegatedToExpectedNs: false,
        pointsToServer: false,
        wwwPointsToServer: null,
        status: 'pending',
        message: 'Konto hostingowe jest jeszcze w trakcie zakładania.',
        issues: [],
        checkedAt: new Date().toISOString(),
      };
    }

    const domain = sub.account.domain;
    const expected = sub.account.server.ipAddress;
    const serverName = sub.account.server.name ?? sub.account.server.hostname;
    const serverNs = [sub.account.server.ns1, sub.account.server.ns2, sub.account.server.ns3]
      .map((value) => (value ?? '').trim().toLowerCase())
      .filter(Boolean);
    const platformNs = await this.platformSettings.getHostingNameservers();
    const fallbackNs = [platformNs.ns1, platformNs.ns2, platformNs.ns3]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const expectedNameservers = (serverNs[0] && serverNs[1] ? serverNs : fallbackNs).filter(Boolean);

    const [aRecords, aaaaRecords, wwwA, nsRecords] = await Promise.all([
      resolveSafe(() => dns.resolve4(domain)),
      resolveSafe(() => dns.resolve6(domain)),
      resolveSafe(() => dns.resolve4(`www.${domain}`)),
      resolveSafe(() => dns.resolveNs(domain)),
    ]);

    const pointsToServer = aRecords.includes(expected);
    const wwwPointsToServer =
      wwwA.length === 0 ? null : wwwA.includes(expected) || wwwA.some((ip) => aRecords.includes(ip));
    const delegatedToExpectedNs =
      expectedNameservers.length >= 2 &&
      expectedNameservers.every((ns) => nsRecords.map((entry) => entry.toLowerCase()).includes(ns));
    const pointsByA = pointsToServer && (wwwPointsToServer === true || wwwPointsToServer === null);
    const pointsByNs = delegatedToExpectedNs;

    const issues: string[] = [];
    if (!pointsByNs && !pointsByA) {
      if (aRecords.length === 0 && aaaaRecords.length === 0) {
        issues.push(`Brak rekordu A/AAAA dla ${domain} — domena nie wskazuje nigdzie.`);
      } else if (!pointsToServer) {
        issues.push(
          `Rekord A wskazuje na ${aRecords.join(', ') || '—'}, oczekiwany adres serwera to ${expected}.`,
        );
      }
      if (expectedNameservers.length >= 2 && nsRecords.length > 0 && !delegatedToExpectedNs) {
        issues.push(
          `Delegacja NS wskazuje na ${nsRecords.join(', ')}, oczekiwane NS: ${expectedNameservers.join(', ')}.`,
        );
      }
    }
    if (wwwA.length > 0 && wwwPointsToServer === false) {
      issues.push(`Subdomena www.${domain} nie wskazuje na serwer hostingu (${expected}).`);
    }

    let status: DnsPointingStatus = 'fail';
    if (pointsByNs || pointsByA) {
      status = 'ok';
    } else if (aRecords.length > 0 || aaaaRecords.length > 0 || nsRecords.length > 0) {
      status = 'partial';
    } else if (aRecords.length === 0 && aaaaRecords.length === 0 && nsRecords.length === 0) {
      status = 'fail';
    }

    const message =
      status === 'ok'
        ? pointsByNs
          ? `Domena ${domain} jest poprawnie delegowana na NS hostingu Verris.`
          : `Domena ${domain} wskazuje na Twój serwer (${expected}) przez rekordy A/AAAA.`
        : status === 'partial'
          ? `Domena częściowo skonfigurowana — sprawdź konfigurację NS oraz rekordy A/AAAA.`
          : status === 'fail'
            ? `Domena nie kieruje jeszcze na hosting Verris.`
            : 'Oczekiwanie na konto hostingowe.';

    return {
      domain,
      expectedIpv4: expected,
      serverName,
      expectedNameservers,
      observedA: aRecords,
      observedAaaa: aaaaRecords,
      observedWwwA: wwwA,
      nameservers: nsRecords,
      delegatedToExpectedNs,
      pointsToServer,
      wwwPointsToServer,
      status,
      message,
      issues,
      checkedAt: new Date().toISOString(),
    };
  }
}

async function resolveSafe(fn: () => Promise<string[]>): Promise<string[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}
