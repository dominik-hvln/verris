import { Injectable, NotFoundException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import { PrismaService } from '../prisma/prisma.service';

export type DnsPointingStatus = 'ok' | 'partial' | 'fail' | 'pending';

export interface HostingDnsPointingResult {
  domain: string | null;
  expectedIpv4: string | null;
  serverName: string | null;
  observedA: string[];
  observedAaaa: string[];
  observedWwwA: string[];
  nameservers: string[];
  pointsToServer: boolean;
  wwwPointsToServer: boolean | null;
  status: DnsPointingStatus;
  message: string;
  issues: string[];
  checkedAt: string;
}

@Injectable()
export class HostingDnsPointingService {
  constructor(private readonly prisma: PrismaService) {}

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
        observedA: [],
        observedAaaa: [],
        observedWwwA: [],
        nameservers: [],
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

    const [aRecords, aaaaRecords, wwwA, nsRecords] = await Promise.all([
      resolveSafe(() => dns.resolve4(domain)),
      resolveSafe(() => dns.resolve6(domain)),
      resolveSafe(() => dns.resolve4(`www.${domain}`)),
      resolveSafe(() => dns.resolveNs(domain)),
    ]);

    const pointsToServer = aRecords.includes(expected);
    const wwwPointsToServer =
      wwwA.length === 0 ? null : wwwA.includes(expected) || wwwA.some((ip) => aRecords.includes(ip));

    const issues: string[] = [];
    if (aRecords.length === 0 && aaaaRecords.length === 0) {
      issues.push(`Brak rekordu A/AAAA dla ${domain} — domena nie wskazuje nigdzie.`);
    } else if (!pointsToServer) {
      issues.push(
        `Rekord A wskazuje na ${aRecords.join(', ') || '—'}, oczekiwany adres serwera to ${expected}.`,
      );
    }
    if (wwwA.length > 0 && wwwPointsToServer === false) {
      issues.push(`Subdomena www.${domain} nie wskazuje na serwer hostingu (${expected}).`);
    }

    let status: DnsPointingStatus = 'fail';
    if (pointsToServer && (wwwPointsToServer === true || wwwPointsToServer === null)) {
      status = 'ok';
    } else if (pointsToServer || aRecords.length > 0) {
      status = 'partial';
    } else if (aRecords.length === 0 && aaaaRecords.length === 0) {
      status = 'fail';
    }

    const message =
      status === 'ok'
        ? `Domena ${domain} wskazuje na Twój serwer (${expected}).`
        : status === 'partial'
          ? `Domena częściowo skonfigurowana — sprawdź rekordy A poniżej.`
          : status === 'fail'
            ? `Domena nie kieruje jeszcze na hosting Verris.`
            : 'Oczekiwanie na konto hostingowe.';

    return {
      domain,
      expectedIpv4: expected,
      serverName,
      observedA: aRecords,
      observedAaaa: aaaaRecords,
      observedWwwA: wwwA,
      nameservers: nsRecords,
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
