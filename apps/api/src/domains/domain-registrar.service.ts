import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomainRegistrarOrderStatus, DomainRegistrarOrderType, DomainStatus, Prisma } from '@verris/database';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { RegistrarProviderFactory } from './registrar.provider';

@Injectable()
export class DomainRegistrarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly providerFactory: RegistrarProviderFactory,
  ) {}

  async availability(name: string) {
    return this.providerFactory.get().availability(normalizeDomain(name));
  }

  async register(userId: string, actorUserId: string, input: { name: string; years?: number; nameservers?: string[] }) {
    const domain = normalizeDomain(input.name);
    const provider = this.providerFactory.get();
    const availability = await provider.availability(domain);
    if (!availability.available) {
      throw new BadRequestException('Domena nie jest dostępna do rejestracji.');
    }
    const years = input.years ?? 1;
    const nameservers = sanitizeNameservers(input.nameservers);
    const result = await provider.register({ domain, years, nameservers });
    const row = await this.prisma.$transaction(async (tx) => {
      const domainRow = await tx.domain.upsert({
        where: { name: domain },
        create: {
          name: domain,
          userId,
          status: DomainStatus.PENDING,
          registrarProvider: result.provider,
          registrarExternalId: result.externalDomainId,
          registrarStatus: 'REGISTERED',
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
          nameservers,
        },
        update: {
          registrarProvider: result.provider,
          registrarExternalId: result.externalDomainId,
          registrarStatus: 'REGISTERED',
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined,
          nameservers,
          lastRegistrarSyncAt: new Date(),
        },
      });
      return tx.domainRegistrarOrder.create({
        data: {
          domainName: domain,
          type: DomainRegistrarOrderType.REGISTER,
          status: DomainRegistrarOrderStatus.COMPLETED,
          provider: result.provider,
          providerOrderId: result.providerOrderId,
          domainId: domainRow.id,
          userId,
          years,
          nameservers,
          priceAmount: availability.priceAmount ? new Prisma.Decimal(availability.priceAmount) : undefined,
          currency: availability.currency ?? 'PLN',
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
    });
    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_REGISTERED',
      userId,
      actorUserId,
      details: { orderId: row.id, domain, provider: result.provider, years },
    });
    return row;
  }

  async transfer(userId: string, actorUserId: string, input: { name: string; authCode: string; years?: number; nameservers?: string[] }) {
    const domain = normalizeDomain(input.name);
    const provider = this.providerFactory.get();
    const years = input.years ?? 1;
    const nameservers = sanitizeNameservers(input.nameservers);
    const result = await provider.transfer({ domain, years, nameservers, authCode: input.authCode });
    const order = await this.prisma.domainRegistrarOrder.create({
      data: {
        domainName: domain,
        type: DomainRegistrarOrderType.TRANSFER,
        status: DomainRegistrarOrderStatus.SUBMITTED,
        provider: result.provider,
        providerOrderId: result.providerOrderId,
        authCodeEnc: this.crypto.encrypt(input.authCode),
        userId,
        years,
        nameservers,
        submittedAt: new Date(),
      },
    });
    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_TRANSFER_SUBMITTED',
      userId,
      actorUserId,
      details: { orderId: order.id, domain, provider: result.provider, authCodeHash: hashSecret(input.authCode) },
    });
    return order;
  }

  async orders(userId: string) {
    return this.prisma.domainRegistrarOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        domainName: true,
        type: true,
        status: true,
        provider: true,
        years: true,
        priceAmount: true,
        currency: true,
        lastError: true,
        createdAt: true,
        submittedAt: true,
        completedAt: true,
      },
    });
  }

  async renew(userId: string, actorUserId: string, domainId: string, years = 1) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, userId } });
    if (!domain) throw new NotFoundException('Domena nie została znaleziona.');
    const provider = this.providerFactory.get();
    const result = await provider.renew({ domain: domain.name, years, externalId: domain.registrarExternalId });
    const order = await this.prisma.domainRegistrarOrder.create({
      data: {
        domainName: domain.name,
        type: DomainRegistrarOrderType.RENEW,
        status: DomainRegistrarOrderStatus.COMPLETED,
        provider: result.provider,
        providerOrderId: result.providerOrderId,
        userId,
        domainId: domain.id,
        years,
        submittedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_RENEWED',
      userId,
      actorUserId,
      details: { orderId: order.id, domainId, years },
    });
    return order;
  }
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function sanitizeNameservers(value?: string[]): string[] {
  return (value ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean).slice(0, 8);
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
