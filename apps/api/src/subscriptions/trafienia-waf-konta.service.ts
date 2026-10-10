import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { stanTrafien } from '../servers/trafienia-waf.js';

/**
 * F3.2 — trafienia reguł WAF (ModSecurity) dla domen konta na karcie usługi: odczyt (ACCOUNT_DIAGNOSTICS_VIEW, L2+).
 * Zadanie WAF_HITS tylko czyta dziennik audytu na węźle; konfiguracja WAF (tryb konta) zostaje przy ADMIN
 * (WafAdminController). Domeny konta podaje API (jak przy kolejce poczty), nie operator.
 */
@Injectable()
export class TrafieniaWafKontaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  private async konto(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, account: { select: { id: true, serverId: true, domain: true, status: true, wafMode: true, wafAppliedAt: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!sub.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    return { userId: sub.userId, account: sub.account };
  }

  private zadania(accountId: string) {
    return this.prisma.nodeTask.findMany({ where: { accountId, kind: NodeTaskKind.WAF_HITS }, orderBy: { createdAt: 'desc' }, take: 5 });
  }

  async widok(subscriptionId: string) {
    const { account } = await this.konto(subscriptionId);
    return {
      tryb: account.wafMode,
      zastosowano: account.wafAppliedAt?.toISOString() ?? null,
      ...stanTrafien(await this.zadania(account.id)),
    };
  }

  /** Zleca węzłowi odczyt dziennika WAF dla domen konta (zlecający = operator). */
  async wczytaj(subscriptionId: string, wlascicielId: string, operatorUserId: string) {
    const { account } = await this.konto(subscriptionId);
    if (account.status === 'DELETED' || account.status === 'PROVISIONING') throw new BadRequestException('Konto hostingowe nie działa na serwerze.');
    if (stanTrafien(await this.zadania(account.id)).wToku) throw new ConflictException('Trafienia WAF już się wczytują — chwila.');
    const { domains } = await this.directAdmin.listHostingDomainsForSubscription(subscriptionId, wlascicielId);
    const domeny = [...new Set([account.domain, ...domains.map((d) => d.name)].map((d) => d.toLowerCase()))].slice(0, 200);
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.WAF_HITS,
        status: NodeTaskStatus.QUEUED,
        requestedById: operatorUserId,
        payload: { domains: domeny.join(',') },
      },
    });
    return this.widok(subscriptionId);
  }
}
