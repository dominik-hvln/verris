import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MigrationStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MigrationActions } from '../common/audit/audit.actions';
import {
  HostingDnsPointingService,
  type HostingDnsPointingResult,
} from './hosting-dns-pointing.service';

/**
 * Cutover DNS — ostatni krok migracji A→Z.
 *
 * Zasada uczciwości: niczego nie „udajemy”. Jeżeli domena jest delegowana na
 * nasze NS, strefa na węźle DirectAdmin już wskazuje na właściwy serwer —
 * cutover sprowadza się do weryfikacji. Jeżeli NS są obce, generujemy komplet
 * rekordów do ustawienia u rejestratora/dostawcy DNS (albo instrukcję zmiany
 * NS na nasze) i weryfikujemy na życzenie klienta, aż propagacja dojdzie.
 */

export interface CutoverRecordInstruction {
  type: 'A' | 'MX' | 'NS';
  name: string;
  value: string;
  priority?: number;
  note: string;
}

export interface CutoverPlan {
  migrationRequestId: string;
  domain: string | null;
  status: 'done' | 'ready' | 'waiting-dns' | 'blocked';
  message: string;
  deltaSyncRecommended: boolean;
  dns: HostingDnsPointingResult;
  nameserverOption: { nameservers: string[]; note: string } | null;
  records: CutoverRecordInstruction[];
  cutoverAt: string | null;
  cutoverMode: string | null;
}

@Injectable()
export class MigrationCutoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dnsPointing: HostingDnsPointingService,
    private readonly audit: AuditService,
  ) {}

  async plan(subscriptionId: string, userId: string, migrationRequestId: string): Promise<CutoverPlan> {
    const request = await this.getRequest(subscriptionId, userId, migrationRequestId);
    const dns = await this.dnsPointing.verifyForSubscription(subscriptionId, userId);

    await this.audit.record({
      action: MigrationActions.MIGRATION_CUTOVER_REQUESTED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, migrationRequestId, dnsStatus: dns.status },
    });

    return this.buildPlan(request, dns);
  }

  /**
   * Weryfikacja po zmianie DNS przez klienta. Gdy domena wskazuje na nasz
   * serwer — oznaczamy cutover jako wykonany (zapis + event + audyt).
   */
  async verify(subscriptionId: string, userId: string, migrationRequestId: string): Promise<CutoverPlan> {
    const request = await this.getRequest(subscriptionId, userId, migrationRequestId);
    const dns = await this.dnsPointing.verifyForSubscription(subscriptionId, userId);
    const pointsToUs = dns.pointsToServer || dns.delegatedToExpectedNs;

    if (pointsToUs && !request.cutoverAt) {
      const mode = dns.delegatedToExpectedNs ? 'ns' : 'a-records';
      await this.prisma.migrationRequest.update({
        where: { id: request.id },
        data: { cutoverAt: new Date(), cutoverMode: mode, currentStep: 'done' },
      });
      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId,
          type: 'MIGRATION_CUTOVER_DNS_APPLIED',
          details: { migrationRequestId: request.id, mode, domain: dns.domain },
        },
      });
      await this.audit.record({
        action: MigrationActions.MIGRATION_CUTOVER_DNS_APPLIED,
        userId,
        actorUserId: userId,
        details: { subscriptionId, migrationRequestId: request.id, mode },
      });
      request.cutoverAt = new Date();
      request.cutoverMode = mode;
    }

    return this.buildPlan(request, dns);
  }

  private async getRequest(subscriptionId: string, userId: string, migrationRequestId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    const request = await this.prisma.migrationRequest.findFirst({
      where: { id: migrationRequestId, subscriptionId },
      include: { workerJobs: true },
    });
    if (!request) throw new NotFoundException('Migration request not found');
    if (request.status === MigrationStatus.QUEUED || request.status === MigrationStatus.DRAFT) {
      throw new BadRequestException('Cutover DNS będzie dostępny po zakończeniu transferu danych.');
    }
    return request;
  }

  private buildPlan(
    request: {
      id: string;
      status: MigrationStatus;
      cutoverAt: Date | null;
      cutoverMode: string | null;
      completedAt: Date | null;
      workerJobs: Array<{ kind: string; status: string; completedAt: Date | null }>;
    },
    dns: HostingDnsPointingResult,
  ): CutoverPlan {
    const pointsToUs = dns.pointsToServer || dns.delegatedToExpectedNs;
    const ip = dns.expectedIpv4;
    const domain = dns.domain;

    // Delta-sync rekomendowany, gdy od zakończenia transferu minęło > 6h,
    // a cutover jeszcze nie nastąpił (na starym hostingu mogły przybyć dane).
    const lastTransfer = request.workerJobs
      .filter((j) => j.status === 'COMPLETED' && j.completedAt)
      .map((j) => j.completedAt!.getTime())
      .sort((a, b) => b - a)[0];
    const deltaSyncRecommended =
      !request.cutoverAt &&
      request.status === MigrationStatus.COMPLETED &&
      typeof lastTransfer === 'number' &&
      Date.now() - lastTransfer > 6 * 60 * 60 * 1000;

    let status: CutoverPlan['status'];
    let message: string;
    if (request.cutoverAt || pointsToUs) {
      status = 'done';
      message = dns.delegatedToExpectedNs
        ? 'Domena jest delegowana na nasze serwery nazw — ruch trafia już na nowy hosting.'
        : 'Rekordy DNS wskazują na nasz serwer — ruch trafia już na nowy hosting.';
    } else if (request.status === MigrationStatus.COMPLETED) {
      status = 'waiting-dns';
      message =
        'Dane są przeniesione. Ustaw poniższe rekordy DNS u obecnego dostawcy (albo przełącz NS na nasze), ' +
        'a potem kliknij „Sprawdź DNS”. Do czasu przełączenia stara strona działa bez przerwy.';
    } else if (request.status === MigrationStatus.RUNNING) {
      status = 'ready';
      message = 'Transfer danych jeszcze trwa — cutover DNS będzie możliwy po jego zakończeniu.';
    } else {
      status = 'blocked';
      message = 'Zlecenie wymaga uwagi naszego zespołu — cutover wstrzymany do wyjaśnienia.';
    }

    const records: CutoverRecordInstruction[] = [];
    if (domain && ip && !pointsToUs) {
      records.push(
        {
          type: 'A',
          name: domain,
          value: ip,
          note: 'Główny rekord strony — kieruje domenę na nowy serwer.',
        },
        {
          type: 'A',
          name: `www.${domain}`,
          value: ip,
          note: 'Wariant www strony.',
        },
        {
          type: 'A',
          name: `mail.${domain}`,
          value: ip,
          note: 'Serwer poczty (wymagany, jeśli przenosisz skrzynki).',
        },
        {
          type: 'MX',
          name: domain,
          value: `mail.${domain}`,
          priority: 10,
          note: 'Dostarczanie poczty na nowy serwer — zmień dopiero po delta-syncu skrzynek.',
        },
      );
    }

    const nameserverOption =
      dns.expectedNameservers.length >= 2 && !dns.delegatedToExpectedNs
        ? {
            nameservers: dns.expectedNameservers,
            note:
              'Najprostsza opcja: u rejestratora domeny zmień serwery nazw (NS) na powyższe — ' +
              'całą strefą DNS zarządzamy wtedy my i nic więcej nie musisz ustawiać.',
          }
        : null;

    return {
      migrationRequestId: request.id,
      domain,
      status,
      message,
      deltaSyncRecommended,
      dns,
      nameserverOption,
      records,
      cutoverAt: request.cutoverAt?.toISOString() ?? null,
      cutoverMode: request.cutoverMode,
    };
  }
}
