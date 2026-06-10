import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DomainRegistrarOrder,
  DomainRegistrarOrderStatus,
  DomainRegistrarOrderType,
  DomainStatus,
  Prisma,
  WalletTxType,
} from '@verris/database';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import {
  parseDomainPricingConfig,
  toCustomerDomainPrice,
  type DomainPricingConfig,
} from './domain-pricing.util';
import { NbpFxService } from './nbp-fx.service';
import {
  RegistrarOperation,
  RegistrarOrderResult,
  RegistrarProviderFactory,
} from './registrar.provider';

@Injectable()
export class DomainRegistrarService {
  private readonly logger = new Logger(DomainRegistrarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly providerFactory: RegistrarProviderFactory,
    private readonly wallet: WalletLedgerService,
    private readonly config: ConfigService,
    private readonly nbpFx: NbpFxService,
  ) {}

  async quote(name: string, years = 1) {
    const domain = normalizeDomain(name);
    const provider = this.providerFactory.get();
    const availability = await provider.availability(domain);
    if (!availability.available) {
      return {
        domain,
        available: false,
        premium: availability.premium ?? false,
        years,
        priceAmount: null,
        currency: 'PLN',
      };
    }

    const price = await this.resolvePrice(provider, domain, years, 'register', {
      amount: availability.priceAmount,
      currency: availability.currency,
    });

    return {
      domain,
      available: true,
      premium: availability.premium ?? false,
      years,
      priceAmount: price.amount,
      currency: price.currency,
    };
  }

  async availability(name: string) {
    const provider = this.providerFactory.get();
    const availability = await provider.availability(normalizeDomain(name));
    // Surface the *customer* price (reseller cost × markup), not the raw cost.
    if (availability.priceAmount) {
      const customer = await this.toCustomerPrice(
        availability.priceAmount,
        availability.currency ?? 'USD',
      );
      return { ...availability, priceAmount: customer.amount, currency: customer.currency };
    }
    return availability;
  }

  async register(
    userId: string,
    actorUserId: string,
    input: { name: string; years?: number; nameservers?: string[] },
  ) {
    const domain = normalizeDomain(input.name);
    const provider = this.providerFactory.get();
    const availability = await provider.availability(domain);
    if (!availability.available) {
      throw new BadRequestException('Domena nie jest dostępna do rejestracji.');
    }
    const years = input.years ?? 1;
    const nameservers = sanitizeNameservers(input.nameservers);

    const price = await this.resolvePrice(provider, domain, years, 'register', {
      amount: availability.priceAmount,
      currency: availability.currency,
    });

    // 1. Create the order first so the wallet charge has a stable idempotency anchor.
    const order = await this.prisma.domainRegistrarOrder.create({
      data: {
        domainName: domain,
        type: DomainRegistrarOrderType.REGISTER,
        status: DomainRegistrarOrderStatus.QUEUED,
        userId,
        years,
        nameservers,
        priceAmount: new Prisma.Decimal(price.amount),
        currency: price.currency,
      },
    });

    // 2. Charge the wallet (fail-closed: no funds → no registration).
    const tx = await this.charge(userId, order, price, `Rejestracja domeny ${domain} (${years} lata/lat)`);

    // 3. Call the registrar; refund + fail the order on provider error.
    let result: RegistrarOrderResult;
    try {
      result = await provider.register({ domain, years, nameservers });
    } catch (err) {
      await this.refundAndFail(userId, order, tx.id, err, price);
      throw err;
    }

    const completed = await this.prisma.$transaction(async (db) => {
      const domainRow = await db.domain.upsert({
        where: { name: domain },
        create: {
          name: domain,
          userId,
          status: DomainStatus.ACTIVE,
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
      return db.domainRegistrarOrder.update({
        where: { id: order.id },
        data: {
          status: DomainRegistrarOrderStatus.COMPLETED,
          provider: result.provider,
          providerOrderId: result.providerOrderId,
          domainId: domainRow.id,
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_REGISTERED',
      userId,
      actorUserId,
      details: {
        orderId: completed.id,
        domain,
        provider: result.provider,
        years,
        priceAmount: price.amount,
        currency: price.currency,
        walletTxId: tx.id,
      },
    });
    return completed;
  }

  async transfer(
    userId: string,
    actorUserId: string,
    input: { name: string; authCode: string; years?: number; nameservers?: string[] },
  ) {
    const domain = normalizeDomain(input.name);
    const provider = this.providerFactory.get();
    const years = input.years ?? 1;
    const nameservers = sanitizeNameservers(input.nameservers);

    const price = await this.resolvePrice(provider, domain, years, 'transfer');

    const order = await this.prisma.domainRegistrarOrder.create({
      data: {
        domainName: domain,
        type: DomainRegistrarOrderType.TRANSFER,
        status: DomainRegistrarOrderStatus.QUEUED,
        authCodeEnc: this.crypto.encrypt(input.authCode),
        userId,
        years,
        nameservers,
        priceAmount: new Prisma.Decimal(price.amount),
        currency: price.currency,
      },
    });

    const tx = await this.charge(userId, order, price, `Transfer domeny ${domain}`);

    let result: RegistrarOrderResult;
    try {
      result = await provider.transfer({ domain, years, nameservers, authCode: input.authCode });
    } catch (err) {
      await this.refundAndFail(userId, order, tx.id, err, price);
      throw err;
    }

    const submitted = await this.prisma.domainRegistrarOrder.update({
      where: { id: order.id },
      data: {
        status: DomainRegistrarOrderStatus.SUBMITTED,
        provider: result.provider,
        providerOrderId: result.providerOrderId,
        submittedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_TRANSFER_SUBMITTED',
      userId,
      actorUserId,
      details: {
        orderId: submitted.id,
        domain,
        provider: result.provider,
        priceAmount: price.amount,
        currency: price.currency,
        walletTxId: tx.id,
        authCodeHash: hashSecret(input.authCode),
      },
    });
    return submitted;
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
        walletTxId: true,
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

    const price = await this.resolvePrice(provider, domain.name, years, 'renew');

    const order = await this.prisma.domainRegistrarOrder.create({
      data: {
        domainName: domain.name,
        type: DomainRegistrarOrderType.RENEW,
        status: DomainRegistrarOrderStatus.QUEUED,
        userId,
        domainId: domain.id,
        years,
        priceAmount: new Prisma.Decimal(price.amount),
        currency: price.currency,
      },
    });

    const tx = await this.charge(userId, order, price, `Odnowienie domeny ${domain.name} (${years} lata/lat)`);

    let result: RegistrarOrderResult;
    try {
      result = await provider.renew({
        domain: domain.name,
        years,
        externalId: domain.registrarExternalId,
      });
    } catch (err) {
      await this.refundAndFail(userId, order, tx.id, err, price);
      throw err;
    }

    const completed = await this.prisma.$transaction(async (db) => {
      if (result.expiresAt) {
        await db.domain.update({
          where: { id: domain.id },
          data: { expiresAt: new Date(result.expiresAt), lastRegistrarSyncAt: new Date() },
        });
      }
      return db.domainRegistrarOrder.update({
        where: { id: order.id },
        data: {
          status: DomainRegistrarOrderStatus.COMPLETED,
          provider: result.provider,
          providerOrderId: result.providerOrderId,
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_RENEWED',
      userId,
      actorUserId,
      details: {
        orderId: completed.id,
        domainId,
        years,
        priceAmount: price.amount,
        currency: price.currency,
        walletTxId: tx.id,
      },
    });
    return completed;
  }

  // ---------------------------------------------------------------------------
  // Billing helpers
  // ---------------------------------------------------------------------------

  /** Resolves customer price: FX → PLN wholesale → markup. */
  private async resolvePrice(
    provider: ReturnType<RegistrarProviderFactory['get']>,
    domain: string,
    years: number,
    operation: RegistrarOperation,
    fallback?: { amount?: string | null; currency?: string | null },
  ): Promise<{ amount: string; currency: string }> {
    try {
      const p = await provider.price({ domain, years, operation });
      return await this.toCustomerPrice(p.amount, p.currency);
    } catch (err) {
      if (fallback?.amount) {
        const wholesaleTotal = new Prisma.Decimal(fallback.amount).mul(years);
        return await this.toCustomerPrice(wholesaleTotal.toString(), fallback.currency ?? 'USD');
      }
      this.logger.error(
        `Brak ceny rejestratora dla ${domain}/${operation}: ${(err as Error).message}`,
      );
      throw new BadRequestException('Nie udało się ustalić ceny domeny u rejestratora.');
    }
  }

  private async pricingConfig(): Promise<DomainPricingConfig> {
    const base = parseDomainPricingConfig((key) => this.config.get<string>(key));
    const fx = await this.nbpFx.getRates();
    return {
      ...base,
      usdPln: fx.usdPln,
      eurPln: fx.eurPln,
    };
  }

  private async toCustomerPrice(rawAmount: string | number, sourceCurrency?: string | null) {
    try {
      const cfg = await this.pricingConfig();
      return toCustomerDomainPrice(rawAmount, sourceCurrency ?? 'USD', cfg);
    } catch {
      throw new BadRequestException(
        `Nieobsługiwana waluta cennika rejestratora: ${sourceCurrency ?? '?'}`,
      );
    }
  }

  private async charge(
    userId: string,
    order: DomainRegistrarOrder,
    price: { amount: string; currency: string },
    description: string,
  ) {
    try {
      const tx = await this.wallet.debit({
        userId,
        amount: price.amount,
        type: WalletTxType.CHARGE_DOMAIN,
        description,
        idempotencyKey: `domain-${order.type.toLowerCase()}:${order.id}`,
        metadata: { orderId: order.id, domain: order.domainName, years: order.years } as Prisma.InputJsonValue,
      });
      await this.prisma.domainRegistrarOrder.update({
        where: { id: order.id },
        data: { walletTxId: tx.id },
      });
      return tx;
    } catch (err) {
      await this.prisma.domainRegistrarOrder.update({
        where: { id: order.id },
        data: {
          status: DomainRegistrarOrderStatus.PENDING_PAYMENT,
          lastError: (err as Error).message.slice(0, 1000),
        },
      });
      throw new BadRequestException(
        'Brak wystarczających środków w portfelu na opłacenie domeny. Doładuj portfel i spróbuj ponownie.',
      );
    }
  }

  private async refundAndFail(
    userId: string,
    order: DomainRegistrarOrder,
    walletTxId: string,
    err: unknown,
    price: { amount: string; currency: string },
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Registrar ${order.type} ${order.domainName} failed, refunding: ${message}`);
    try {
      await this.wallet.credit({
        userId,
        amount: price.amount,
        type: WalletTxType.REFUND,
        description: `Zwrot za nieudaną operację domeny ${order.domainName}`,
        idempotencyKey: `domain-${order.type.toLowerCase()}-refund:${order.id}`,
        metadata: { orderId: order.id, originalTxId: walletTxId } as Prisma.InputJsonValue,
      });
    } catch (refundErr) {
      this.logger.error(
        `Refund failed for order=${order.id}: ${(refundErr as Error).message} — wymaga ręcznej korekty.`,
      );
    }
    await this.prisma.domainRegistrarOrder.update({
      where: { id: order.id },
      data: { status: DomainRegistrarOrderStatus.FAILED, lastError: message.slice(0, 1000) },
    });
    await this.audit.record({
      action: 'DOMAIN_REGISTRAR_FAILED',
      userId,
      details: { orderId: order.id, domain: order.domainName, type: order.type, error: message },
    });
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
