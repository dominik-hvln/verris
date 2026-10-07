import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as dnsLookup from 'node:dns/promises';
import { MigrationStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MigrationActions } from '../common/audit/audit.actions.js';
import {
  HostingDnsPointingService,
  type HostingDnsPointingResult,
} from './hosting-dns-pointing.service.js';

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
    const mxDoNas = tylkoPoczta(request.workerJobs) ? await mxWskazujeNa(dns.domain, dns.expectedIpv4) : false;

    await this.audit.record({
      action: MigrationActions.MIGRATION_CUTOVER_REQUESTED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, migrationRequestId, dnsStatus: dns.status },
    });

    return this.buildPlan(request, dns, mxDoNas);
  }

  /**
   * Weryfikacja po zmianie DNS przez klienta. Gdy domena wskazuje na nasz
   * serwer — oznaczamy cutover jako wykonany (zapis + event + audyt).
   */
  async verify(subscriptionId: string, userId: string, migrationRequestId: string): Promise<CutoverPlan> {
    const request = await this.getRequest(subscriptionId, userId, migrationRequestId);
    const dns = await this.dnsPointing.verifyForSubscription(subscriptionId, userId);
    const poczta = tylkoPoczta(request.workerJobs);
    const mxDoNas = poczta ? await mxWskazujeNa(dns.domain, dns.expectedIpv4) : false;
    // Sama poczta: liczy się MX (albo nasze NS), nie rekord A strony — strona klienta może zostać gdzie indziej.
    const pointsToUs = dns.delegatedToExpectedNs || (poczta ? mxDoNas : dns.pointsToServer);

    if (pointsToUs && !request.cutoverAt) {
      const mode = dns.delegatedToExpectedNs ? 'ns' : poczta ? 'mx' : 'a-records';
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

    return this.buildPlan(request, dns, mxDoNas);
  }

  private async getRequest(subscriptionId: string, userId: string, migrationRequestId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    const request = await this.prisma.migrationRequest.findFirst({
      where: { id: migrationRequestId, subscriptionId },
      include: { workerJobs: true },
    });
    if (!request) throw new NotFoundException('Nie znaleziono zlecenia migracji.');
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
    mxDoNas = false,
  ): CutoverPlan {
    // Uwaga z t1 03.10: po samej migracji poczty plan kazał przełączyć rekordy A strony i NS — dla klienta,
    // który przenosi tylko pocztę, to przeniosłoby mu też stronę. Dla samej poczty: tylko rekordy poczty.
    const poczta = tylkoPoczta(request.workerJobs);
    const pointsToUs = dns.delegatedToExpectedNs || (poczta ? mxDoNas : dns.pointsToServer);
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
      message = poczta
        ? dns.delegatedToExpectedNs
          ? 'Domena korzysta z naszych serwerów nazw — nowa poczta trafia już do skrzynek na tym koncie.'
          : 'Rekord MX wskazuje na nasz serwer — nowa poczta trafia już do skrzynek na tym koncie.'
        : dns.delegatedToExpectedNs
          ? 'Domena jest delegowana na nasze serwery nazw — ruch trafia już na nowy hosting.'
          : 'Rekordy DNS wskazują na nasz serwer — ruch trafia już na nowy hosting.';
    } else if (request.status === MigrationStatus.COMPLETED) {
      status = 'waiting-dns';
      message = poczta
        ? 'Wiadomości są już w skrzynce na tym koncie. Żeby nowa poczta też trafiała tutaj, ustaw u obecnego dostawcy DNS ' +
          'poniższe rekordy poczty, a potem kliknij „Sprawdź DNS”. Strona zostaje tam, gdzie jest — jej rekordów nie zmieniasz.'
        : 'Dane są przeniesione. Ustaw poniższe rekordy DNS u obecnego dostawcy (albo przełącz NS na nasze), ' +
          'a potem kliknij „Sprawdź DNS”. Do czasu przełączenia stara strona działa bez przerwy.';
    } else if (request.status === MigrationStatus.RUNNING) {
      status = 'ready';
      message = 'Transfer danych jeszcze trwa — cutover DNS będzie możliwy po jego zakończeniu.';
    } else {
      status = 'blocked';
      message = 'Zlecenie wymaga uwagi naszego zespołu — cutover wstrzymany do wyjaśnienia.';
    }

    const records: CutoverRecordInstruction[] = [];
    if (domain && ip && !pointsToUs && !poczta) {
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
    if (domain && ip && !pointsToUs && poczta) {
      records.push(
        { type: 'A', name: `mail.${domain}`, value: ip, note: 'Serwer poczty na tym koncie.' },
        {
          type: 'MX',
          name: domain,
          value: `mail.${domain}`,
          priority: 10,
          note: 'Dostarczanie nowej poczty tutaj — tuż przed zmianą dograj różnice (delta-sync).',
        },
      );
    }

    // Zmiana NS przenosi całą strefę (także stronę) — przy samej poczcie jej nie proponujemy.
    const nameserverOption =
      !poczta && dns.expectedNameservers.length >= 2 && !dns.delegatedToExpectedNs
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

/** Migracja samej poczty: są kroki IMAP, nie ma plików ani baz. */
export function tylkoPoczta(jobs: Array<{ kind: string }>): boolean {
  return jobs.some((j) => j.kind.startsWith('IMAP')) && !jobs.some((j) => /^(FILES|MYSQL|WP_)/.test(j.kind));
}

/** Czy któryś rekord MX domeny wskazuje (przez A) na adres naszego serwera. */
async function mxWskazujeNa(domain: string | null, ip: string | null): Promise<boolean> {
  if (!domain || !ip) return false;
  const mx = await dnsLookup.resolveMx(domain).catch(() => []);
  for (const { exchange } of mx) {
    const a = await dnsLookup.resolve4(exchange).catch(() => [] as string[]);
    if (a.includes(ip)) return true;
  }
  return false;
}
