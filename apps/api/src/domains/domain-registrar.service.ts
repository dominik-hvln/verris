import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  DomainRegistrarOrder,
  DomainRegistrarOrderStatus,
  DomainRegistrarOrderType,
  DomainStatus,
  Prisma,
  WalletTxType,
} from '@verris/database';
import { createHash } from 'crypto';
import { daErrorMessage } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import type {
  DomainCustomerPriceDto,
  DomainPeriodQuotesDto,
  DomainSearchResultDto,
} from '@verris/contracts';
import { REGISTRAR_TLD_CATALOG } from './registrar-tld-catalog.js';
import type { CustomerDomainPrice } from './domain-pricing.util.js';
import {
  parseDomainPricingConfig,
  toCustomerDomainPrice,
  type DomainPricingConfig,
} from './domain-pricing.util.js';
import { NbpFxService } from './nbp-fx.service.js';
import {
  Registrant,
  RegistrarOperation,
  RegistrarOrderResult,
  RegistrarProviderFactory,
} from './registrar.provider.js';
import { EcoPointsService } from '../eco/eco-points.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';

/** Opis operacji w historii portfela: „1 rok”, „2 lata”, „5 lat”. */
export const lata = (n: number) =>
  `${n} ${n === 1 ? 'rok' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'lata' : 'lat'}`;

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
    private readonly ecoPoints: EcoPointsService,
    private readonly platformSettings: PlatformSettingsService,
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

  /** Cena transferu pokazywana PRZED zleceniem — ta sama ścieżka ceny, którą transfer() obciąża portfel. */
  async quoteTransfer(name: string, years = 1) {
    const domain = normalizeDomain(name);
    const price = await this.resolvePrice(this.providerFactory.get(), domain, years, 'transfer');
    return { domain, years, ...price };
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
      return {
        ...availability,
        priceAmount: customer.grossAmount,
        currency: customer.currency,
      };
    }
    return availability;
  }

  /** Jedno żądanie batch do rejestratora — wszystkie TLD z katalogu. */
  async search(label: string): Promise<DomainSearchResultDto[]> {
    const clean = sanitizeDomainLabel(label);
    if (!clean) {
      throw new BadRequestException('Podaj poprawną nazwę domeny (litery, cyfry, myślnik).');
    }

    const provider = this.providerFactory.get();
    const extensions = REGISTRAR_TLD_CATALOG.map((t) => t.extension);
    const batch = await provider.batchAvailability(clean, extensions);

    const renewalWholesale = new Map<string, { amount: string; currency: string } | null>();
    await Promise.all(
      batch
        .filter((row) => row.available)
        .map(async (row) => {
          try {
            const p = await provider.price({ domain: row.domain, years: 1, operation: 'renew' });
            renewalWholesale.set(row.domain, { amount: p.amount, currency: p.currency });
          } catch (err) {
            this.logger.warn(
              `Brak ceny odnowienia dla ${row.domain}: ${(err as Error).message}`,
            );
            renewalWholesale.set(row.domain, null);
          }
        }),
    );

    const rows = await Promise.all(
      batch.map(async (row, i) => {
        const catalog = REGISTRAR_TLD_CATALOG[i];
        const emptyRegister = await this.emptyCustomerPriceDto();
        let register = emptyRegister;
        let renewal: DomainCustomerPriceDto | null = null;

        if (row.available && row.priceAmount) {
          register = this.toPriceDto(
            await this.toCustomerPrice(row.priceAmount, row.currency ?? 'USD'),
          );
          const renewRaw = renewalWholesale.get(row.domain);
          if (renewRaw) {
            renewal = this.toPriceDto(
              await this.toCustomerPrice(renewRaw.amount, renewRaw.currency),
            );
          }
        }

        return {
          domain: row.domain,
          extension: catalog.extension,
          label: catalog.label,
          popular: catalog.popular,
          available: row.available,
          unknown: Boolean(row.unknown),
          premium: Boolean(row.premium),
          register,
          renewal,
          priceAmount: register.grossAmount,
          currency: register.currency,
        } satisfies DomainSearchResultDto;
      }),
    );

    return rows.sort((a, b) => {
      if (a.popular !== b.popular) return a.popular ? -1 : 1;
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }

  /** Ceny wielu okresów bez ponownego sprawdzania dostępności. */
  async quotePeriods(name: string, yearsList: number[] = [1, 2, 3, 5, 10]): Promise<DomainPeriodQuotesDto> {
    const domain = normalizeDomain(name);
    const provider = this.providerFactory.get();
    const uniqueYears = [...new Set(yearsList)].filter((y) => y >= 1 && y <= 10).sort((a, b) => a - b);

    const [quotes, renewalPerYear] = await Promise.all([
      Promise.all(
        uniqueYears.map(async (years) => {
          const price = await this.resolvePrice(provider, domain, years, 'register');
          return {
            years,
            priceAmount: price.amount,
            netAmount: price.netAmount,
            vatAmount: price.vatAmount,
            currency: price.currency,
            vatRate: price.vatRate,
          };
        }),
      ),
      this.resolveRenewalPerYear(provider, domain),
    ]);

    return { domain, quotes, renewalPerYear };
  }

  async register(
    userId: string,
    actorUserId: string,
    input: { name: string; years?: number; nameservers?: string[]; registrant: Registrant },
  ) {
    const domain = normalizeDomain(input.name);
    const provider = this.providerFactory.get();
    const availability = await provider.availability(domain);
    if (!availability.available) {
      throw new BadRequestException('Domena nie jest dostępna do rejestracji.');
    }
    // A-13: abonent = klient. Uchwyt przed obciążeniem portfela — błąd danych nie kosztuje klienta nic.
    const ownerHandle = await provider.createRegistrant(input.registrant);
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
    const tx = await this.charge(userId, order, price, `Rejestracja domeny ${domain} (${lata(years)})`);

    // 3. Call the registrar; refund + fail the order on provider error.
    let result: RegistrarOrderResult;
    try {
      result = await provider.register({ domain, years, nameservers, ownerHandle });
    } catch (err) {
      await this.refundAndFail(userId, order, tx.id, err, price);
      throw err;
    }

    const { completed, poprzedni } = await this.prisma.$transaction(async (db) => {
      const przypisana = await this.przypiszDomene(db, {
        domain,
        userId,
        provider: result.provider,
        externalId: result.externalDomainId ?? null,
        expiresAt: result.expiresAt ?? null,
        nameservers,
        registrarStatus: 'REGISTERED',
      });
      const zamkniete = await db.domainRegistrarOrder.update({
        where: { id: order.id },
        data: {
          status: DomainRegistrarOrderStatus.COMPLETED,
          provider: result.provider,
          providerOrderId: result.providerOrderId,
          domainId: przypisana.domainRow.id,
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
      return { completed: zamkniete, poprzedni: przypisana.poprzedniUserId };
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
        // Dowód oświadczenia konsumenckiego (art. 38 ust. 1 pkt 1 upk):
        // żądanie natychmiastowej rejestracji + wiedza o utracie prawa
        // odstąpienia z chwilą zarejestrowania domeny (Regulamin §12 ust. 7–8).
        ...(poprzedni ? { replacedClaimOfUserId: poprzedni } : {}),
        withdrawalWaiverConsent: true,
        consentStatement:
          'Żądam natychmiastowego wykonania usługi rejestracji domeny i przyjmuję do wiadomości, że z chwilą jej zarejestrowania tracę prawo odstąpienia od umowy w tym zakresie.',
      },
    });

    const domainRow = await this.prisma.domain.findUnique({
      where: { name: domain },
      select: { id: true },
    });
    if (domainRow) {
      void this.ecoPoints.safeAward(`domain_first:${domainRow.id}`, async () => {
        await this.ecoPoints.awardDomainFirstPaid(this.prisma, userId, domainRow.id);
      });
    }

    return completed;
  }

  async transfer(
    userId: string,
    actorUserId: string,
    input: { name: string; authCode: string; years?: number; nameservers?: string[]; registrant: Registrant },
  ) {
    const domain = normalizeDomain(input.name);
    const provider = this.providerFactory.get();
    const ownerHandle = await provider.createRegistrant(input.registrant);
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
      result = await provider.transfer({ domain, years, nameservers, authCode: input.authCode, ownerHandle });
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

  /**
   * Czy na koncie obowiązuje już oświadczenie konsumenckie dot. domen
   * (żądanie natychmiastowej rejestracji + wiedza o utracie prawa odstąpienia).
   * Oświadczenie składane przy pierwszym zamówieniu zachowuje skuteczność dla
   * kolejnych rejestracji (Regulamin §12 ust. 8) — każde ukończone zamówienie
   * rejestracji wymagało `withdrawalWaiverConsent=true` (walidacja DTO), więc
   * istnienie takiego zamówienia jest dowodem złożonego oświadczenia.
   */
  async hasStandingWaiverConsent(userId: string): Promise<{ granted: boolean; grantedAt: string | null }> {
    const first = await this.prisma.domainRegistrarOrder.findFirst({
      where: {
        userId,
        type: 'REGISTER' as never,
        status: { in: ['SUBMITTED', 'COMPLETED'] as never[] },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return { granted: Boolean(first), grantedAt: first?.createdAt.toISOString() ?? null };
  }

  async orders(userId: string) {
    const zamowienia = await this.prisma.domainRegistrarOrder.findMany({
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
    // `lastError` to surowy tekst od rejestratora/portfela — klient dostaje wersję oczyszczoną; surowy zostaje w bazie i audycie.
    return zamowienia.map((z) => ({ ...z, lastError: z.lastError ? daErrorMessage(z.lastError) : null }));
  }

  /** A-10 — cena odnowienia przed potwierdzeniem (klient widzi kwotę, zanim portfel zostanie obciążony). */
  /** A-13/A-15/A-09 — operacje na domenie u rejestratora; tylko domeny kupione przez nas. */
  private async domenaURejestratora(userId: string, domainId: string) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, userId } });
    if (!domain) throw new NotFoundException('Domena nie została znaleziona.');
    if (!domain.registrarExternalId) {
      throw new BadRequestException(
        'Ta domena nie jest zarejestrowana przez Verris — abonentem, blokadą i kodem transferu zarządzasz u jej obecnego rejestratora.',
      );
    }
    return { domain, externalId: domain.registrarExternalId, provider: this.providerFactory.get() };
  }

  /** Uchwyt abonenta tej domeny; odmowa, gdy domena stoi na uchwycie operatora (rejestracje sprzed A-13). */
  private async uchwytAbonenta(provider: ReturnType<RegistrarProviderFactory['get']>, externalId: string) {
    const info = await provider.domainInfo(externalId);
    if (!info.ownerHandle) throw new BadRequestException('Rejestrator nie zwrócił abonenta domeny.');
    if (provider.operatorHandle && info.ownerHandle === provider.operatorHandle) {
      // Edycja tego uchwytu zmieniłaby dane abonenta WSZYSTKICH takich domen naraz.
      throw new BadRequestException(
        'Ta domena jest zarejestrowana na dane operatora. Przepisanie jej na Ciebie robimy ręcznie — napisz zgłoszenie.',
      );
    }
    return info.ownerHandle;
  }

  async registrant(userId: string, domainId: string) {
    const { externalId, provider } = await this.domenaURejestratora(userId, domainId);
    return provider.getRegistrant(await this.uchwytAbonenta(provider, externalId));
  }

  async updateRegistrant(userId: string, actorUserId: string, domainId: string, next: Registrant) {
    const { domain, externalId, provider } = await this.domenaURejestratora(userId, domainId);
    const handle = await this.uchwytAbonenta(provider, externalId);
    const obecny = await provider.getRegistrant(handle);
    const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
    if (norm(obecny.firstName) !== norm(next.firstName) || norm(obecny.lastName) !== norm(next.lastName)
      || norm(obecny.companyName) !== norm(next.companyName)) {
      // Rejestrator nie zmienia imienia, nazwiska ani firmy abonenta — to cesja domeny, nie poprawka danych.
      throw new BadRequestException(
        'Zmiana właściciela domeny (imię, nazwisko, firma) to cesja — wymaga zgłoszenia. Adres, telefon, e-mail i NIP zmienisz tutaj.',
      );
    }
    await provider.updateRegistrant(handle, next);
    await this.audit.record({
      action: 'DOMAIN_REGISTRANT_UPDATED',
      userId,
      actorUserId,
      details: { domain: domain.name },
    });
    return provider.getRegistrant(handle);
  }

  async setTransferLock(userId: string, actorUserId: string, domainId: string, locked: boolean) {
    const { domain, externalId, provider } = await this.domenaURejestratora(userId, domainId);
    await provider.setTransferLock(externalId, locked);
    await this.prisma.domain.update({ where: { id: domain.id }, data: { transferLock: locked, lastRegistrarSyncAt: new Date() } });
    await this.audit.record({
      action: locked ? 'DOMAIN_TRANSFER_LOCKED' : 'DOMAIN_TRANSFER_UNLOCKED',
      userId,
      actorUserId,
      details: { domain: domain.name },
    });
    return { transferLock: locked };
  }

  /**
   * A-14 — ukrycie danych abonenta w WHOIS. Włączenie jest płatne (cena za rok z ustawień platformy ×
   * rozpoczęte lata do końca ważności domeny) — portfel PRZED rejestratorem, zwrot przy jego błędzie.
   * Wyłączenie: bez opłaty i bez zwrotu za niewykorzystany okres.
   */
  async setWhoisPrivacy(userId: string, actorUserId: string, domainId: string, enabled: boolean) {
    const { domain, externalId, provider } = await this.domenaURejestratora(userId, domainId);
    if (!enabled) {
      try {
        await provider.setWhoisPrivacy(externalId, false);
      } catch (e) {
        throw bladWhois(e);
      }
      return this.zapiszWhois(userId, actorUserId, domain, false);
    }
    if (domain.whoisPrivacy) return { whoisPrivacy: true };
    const cenaRok = await this.platformSettings.getWhoisPrivacyPrice();
    if (!cenaRok) throw new BadRequestException('Ukrycie danych w WHOIS nie jest jeszcze dostępne.');
    const years = rozpoczeteLata(domain.expiresAt);
    const price = { amount: new Prisma.Decimal(cenaRok).mul(years).toFixed(2), currency: 'PLN' };

    // Jak przy odnowieniu: dwuklik nie może dać dwóch obciążeń.
    const order = await this.prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "Domain" WHERE id = ${domain.id} FOR UPDATE`;
      const wToku = await db.domainRegistrarOrder.findFirst({
        where: {
          domainId: domain.id,
          type: DomainRegistrarOrderType.WHOIS_PRIVACY,
          status: { in: [DomainRegistrarOrderStatus.QUEUED, DomainRegistrarOrderStatus.SUBMITTED] },
          createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
        },
        select: { id: true },
      });
      if (wToku) throw new ConflictException('Włączanie ukrycia danych jest już w toku — odśwież stronę za chwilę.');
      return db.domainRegistrarOrder.create({
        data: {
          domainName: domain.name,
          type: DomainRegistrarOrderType.WHOIS_PRIVACY,
          status: DomainRegistrarOrderStatus.QUEUED,
          userId,
          domainId: domain.id,
          years,
          priceAmount: new Prisma.Decimal(price.amount),
          currency: price.currency,
        },
      });
    });

    const tx = await this.charge(userId, order, price, `Ukrycie danych w WHOIS — ${domain.name} (${lata(years)})`);
    try {
      await provider.setWhoisPrivacy(externalId, true);
    } catch (err) {
      // W zamówieniu i logu zostaje surowy błąd rejestratora; klient dostaje zrozumiały komunikat.
      await this.refundAndFail(userId, order, tx.id, err, price);
      throw bladWhois(err);
    }
    await this.prisma.domainRegistrarOrder.update({
      where: { id: order.id },
      data: { status: DomainRegistrarOrderStatus.COMPLETED, provider: provider.id, providerOrderId: externalId, submittedAt: new Date(), completedAt: new Date() },
    });
    return this.zapiszWhois(userId, actorUserId, domain, true, { orderId: order.id, years, priceAmount: price.amount, walletTxId: tx.id });
  }

  private async zapiszWhois(
    userId: string, actorUserId: string, domain: { id: string; name: string }, enabled: boolean, oplata?: Record<string, unknown>,
  ) {
    await this.prisma.domain.update({ where: { id: domain.id }, data: { whoisPrivacy: enabled, lastRegistrarSyncAt: new Date() } });
    await this.audit.record({
      action: enabled ? 'DOMAIN_WHOIS_PRIVACY_ENABLED' : 'DOMAIN_WHOIS_PRIVACY_DISABLED',
      userId,
      actorUserId,
      details: { domain: domain.name, ...oplata },
    });
    return { whoisPrivacy: enabled };
  }

  /** A-14 — przy odnowieniu domeny z włączonym ukryciem danych doliczamy jego cenę za te same lata. */
  private async doplataWhois(domain: { whoisPrivacy: boolean }, years: number): Promise<string | null> {
    if (!domain.whoisPrivacy) return null;
    const cenaRok = await this.platformSettings.getWhoisPrivacyPrice();
    return cenaRok ? new Prisma.Decimal(cenaRok).mul(years).toFixed(2) : null;
  }

  async authCode(userId: string, actorUserId: string, domainId: string) {
    const { domain, externalId, provider } = await this.domenaURejestratora(userId, domainId);
    const code = await provider.authCode(externalId);
    // Samego kodu nie zapisujemy — w audycie tylko fakt wyświetlenia.
    await this.audit.record({
      action: 'DOMAIN_AUTHCODE_REVEALED',
      userId,
      actorUserId,
      details: { domain: domain.name },
    });
    return { authCode: code, transferLock: domain.transferLock };
  }

  async renewQuote(userId: string, domainId: string, years = 1) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, userId } });
    if (!domain) throw new NotFoundException('Domena nie została znaleziona.');
    const price = await this.resolvePrice(this.providerFactory.get(), domain.name, years, 'renew');
    const whois = await this.doplataWhois(domain, years);
    return {
      domain: domain.name,
      years,
      // Kwota całkowita (jedno obciążenie portfela); `whoisPrivacyAmount` to jej część za ukrycie danych.
      priceAmount: whois ? new Prisma.Decimal(price.amount).plus(whois).toFixed(2) : price.amount,
      whoisPrivacyAmount: whois,
      currency: price.currency,
      expiresAt: domain.expiresAt,
    };
  }

  async renew(userId: string, actorUserId: string, domainId: string, years = 1) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, userId } });
    if (!domain) throw new NotFoundException('Domena nie została znaleziona.');
    const provider = this.providerFactory.get();

    const cenaDomeny = await this.resolvePrice(provider, domain.name, years, 'renew');
    const whois = await this.doplataWhois(domain, years);
    const price = whois ? { ...cenaDomeny, amount: new Prisma.Decimal(cenaDomeny.amount).plus(whois).toFixed(2) } : cenaDomeny;

    // Dwuklik „Odnów” tworzył dwa zamówienia z osobnymi kluczami — dwa obciążenia i dwa odnowienia.
    // Blokada wiersza domeny + odmowa, gdy odnowienie tej domeny jest już w toku.
    const order = await this.prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "Domain" WHERE id = ${domain.id} FOR UPDATE`;
      const wToku = await db.domainRegistrarOrder.findFirst({
        where: {
          domainId: domain.id,
          type: DomainRegistrarOrderType.RENEW,
          status: { in: [DomainRegistrarOrderStatus.QUEUED, DomainRegistrarOrderStatus.SUBMITTED] },
          createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
        },
        select: { id: true },
      });
      if (wToku) throw new ConflictException('Odnowienie tej domeny jest już w toku — odśwież stronę za chwilę.');
      return db.domainRegistrarOrder.create({
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
    });

    const tx = await this.charge(
      userId, order, price, `Odnowienie domeny ${domain.name} (${lata(years)})${whois ? ' z ukryciem danych w WHOIS' : ''}`,
    );

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
        ...(whois ? { whoisPrivacyAmount: whois } : {}),
        currency: price.currency,
        walletTxId: tx.id,
      },
    });

    void this.ecoPoints.safeAward(`domain_renewal:${completed.id}`, async () => {
      await this.ecoPoints.awardDomainRenewal(this.prisma, {
        userId,
        domainId,
        referenceId: completed.id,
      });
    });

    return completed;
  }

  // ---------------------------------------------------------------------------
  // Billing helpers
  // ---------------------------------------------------------------------------

  /** Resolves customer gross price: FX → net wholesale → markup → VAT. */
  private async resolvePrice(
    provider: ReturnType<RegistrarProviderFactory['get']>,
    domain: string,
    years: number,
    operation: RegistrarOperation,
    fallback?: { amount?: string | null; currency?: string | null },
  ): Promise<{
    amount: string;
    currency: string;
    netAmount: string;
    vatAmount: string;
    vatRate: number;
  }> {
    try {
      const p = await provider.price({ domain, years, operation });
      return this.toResolvedPrice(await this.toCustomerPrice(p.amount, p.currency));
    } catch (err) {
      if (fallback?.amount) {
        const wholesaleTotal = new Prisma.Decimal(fallback.amount).mul(years);
        return this.toResolvedPrice(
          await this.toCustomerPrice(wholesaleTotal.toString(), fallback.currency ?? 'USD'),
        );
      }
      this.logger.error(
        `Brak ceny rejestratora dla ${domain}/${operation}: ${(err as Error).message}`,
      );
      throw new BadRequestException('Nie udało się ustalić ceny domeny u rejestratora.');
    }
  }

  private async resolveRenewalPerYear(
    provider: ReturnType<RegistrarProviderFactory['get']>,
    domain: string,
  ): Promise<DomainCustomerPriceDto | null> {
    try {
      const p = await provider.price({ domain, years: 1, operation: 'renew' });
      return this.toPriceDto(await this.toCustomerPrice(p.amount, p.currency));
    } catch (err) {
      this.logger.warn(`Brak ceny odnowienia dla ${domain}: ${(err as Error).message}`);
      return null;
    }
  }

  private toResolvedPrice(customer: CustomerDomainPrice) {
    return {
      amount: customer.grossAmount,
      currency: customer.currency,
      netAmount: customer.netAmount,
      vatAmount: customer.vatAmount,
      vatRate: customer.vatRate,
    };
  }

  private toPriceDto(customer: CustomerDomainPrice): DomainCustomerPriceDto {
    return {
      grossAmount: customer.grossAmount,
      netAmount: customer.netAmount,
      vatAmount: customer.vatAmount,
      currency: customer.currency,
      vatRate: customer.vatRate,
    };
  }

  private async emptyCustomerPriceDto(): Promise<DomainCustomerPriceDto> {
    const cfg = await this.pricingConfig();
    return {
      grossAmount: null,
      netAmount: null,
      vatAmount: null,
      currency: cfg.walletCurrency,
      vatRate: cfg.vatRate,
    };
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

  private async toCustomerPrice(
    rawAmount: string | number,
    sourceCurrency?: string | null,
  ): Promise<CustomerDomainPrice> {
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
    let tx;
    try {
      tx = await this.wallet.debit({
        userId,
        amount: price.amount,
        type: WalletTxType.CHARGE_DOMAIN,
        description,
        idempotencyKey: `domain-${order.type.toLowerCase()}:${order.id}`,
        metadata: { orderId: order.id, domain: order.domainName, years: order.years } as Prisma.InputJsonValue,
      });
    } catch (err) {
      await this.prisma.domainRegistrarOrder.update({
        where: { id: order.id },
        data: {
          status: DomainRegistrarOrderStatus.PENDING_PAYMENT,
          lastError: (err as Error).message.slice(0, 1000),
        },
      });
      // Tylko brak środków mówi „doładuj portfel” — inny błąd (baza, blokada) to nie wina salda.
      if (err instanceof ConflictException) {
        throw new BadRequestException(
          'Brak wystarczających środków w portfelu na opłacenie domeny. Doładuj portfel i spróbuj ponownie.',
        );
      }
      throw err;
    }
    // Poza `try` obciążenia: błąd zapisu `walletTxId` po udanym obciążeniu wcześniej kończył się
    // „brak środków” i PENDING_PAYMENT — pieniądze pobrane, domena nie zarejestrowana, bez zwrotu.
    // Obciążenie ma klucz idempotencji z id zamówienia, więc zamówienie da się z nim powiązać także później.
    await this.prisma.domainRegistrarOrder
      .update({ where: { id: order.id }, data: { walletTxId: tx.id } })
      .catch((err) => this.logger.error(`Zamówienie ${order.id}: obciążenie ${tx.id} bez zapisu walletTxId: ${(err as Error).message}`));
    return tx;
  }

  /**
   * Zapisuje domenę na koncie klienta, za którego pieniądze rejestr ją przyjął (rejestracja, transfer).
   * Wiersz o tej nazwie na innym koncie przepisujemy: A-16 pozwala każdemu dopisać dowolną nazwę bez
   * weryfikacji, a bez przepisania domena kupiona przez klienta lądowała u rezerwującego — razem z kodem
   * transferu i blokadą, które idą po właścicielu wiersza.
   */
  private async przypiszDomene(
    db: Prisma.TransactionClient,
    d: { domain: string; userId: string; provider: string; externalId: string | null; expiresAt: string | null; nameservers: string[]; registrarStatus: string },
  ) {
    const poprzedni = await db.domain.findUnique({ where: { name: d.domain }, select: { userId: true } });
    const wspolne = {
      userId: d.userId,
      status: DomainStatus.ACTIVE,
      registrarProvider: d.provider,
      registrarExternalId: d.externalId,
      registrarStatus: d.registrarStatus,
      nameservers: d.nameservers,
    };
    const domainRow = await db.domain.upsert({
      where: { name: d.domain },
      create: { name: d.domain, ...wspolne, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null },
      update: { ...wspolne, expiresAt: d.expiresAt ? new Date(d.expiresAt) : undefined, lastRegistrarSyncAt: new Date() },
    });
    return { domainRow, poprzedniUserId: poprzedni && poprzedni.userId !== d.userId ? poprzedni.userId : null };
  }

  /**
   * A-09 — domknięcie transferów. Do 2026-09-27 zlecony transfer zostawał na zawsze „wysłany do rejestru”:
   * klient płacił, a domena nigdy nie pojawiała się na koncie (bez odnowień, przypomnień, blokady, kodu).
   * Co godzinę pytamy rejestratora o stan: aktywna → domena na koncie płacącego; nieudana → zwrot.
   */
  @Cron('17 * * * *', { name: 'domains:transfer-sync' })
  async domknijTransfery(): Promise<{ zakonczone: number; nieudane: number }> {
    const zlecenia = await this.prisma.domainRegistrarOrder.findMany({
      where: { type: DomainRegistrarOrderType.TRANSFER, status: DomainRegistrarOrderStatus.SUBMITTED, providerOrderId: { not: null } },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    if (!zlecenia.length) return { zakonczone: 0, nieudane: 0 };
    let zakonczone = 0;
    let nieudane = 0;
    let provider: ReturnType<RegistrarProviderFactory['get']>;
    try {
      provider = this.providerFactory.get();
    } catch (e) {
      this.logger.warn(`domknięcie transferów: rejestrator nieskonfigurowany (${(e as Error).message})`);
      return { zakonczone, nieudane };
    }
    for (const z of zlecenia) {
      try {
        const info = await provider.domainInfo(z.providerOrderId!);
        if (info.state === 'active') {
          const wynik = await this.prisma.$transaction(async (db) => {
            const przypisana = await this.przypiszDomene(db, {
              domain: z.domainName,
              userId: z.userId,
              provider: z.provider ?? provider.id,
              externalId: z.providerOrderId,
              expiresAt: info.expiresAt ?? null,
              nameservers: z.nameservers,
              registrarStatus: 'TRANSFERRED',
            });
            // Warunkowo: równoległe przebiegi nie zamkną tego samego zlecenia dwa razy.
            const zm = await db.domainRegistrarOrder.updateMany({
              where: { id: z.id, status: DomainRegistrarOrderStatus.SUBMITTED },
              data: { status: DomainRegistrarOrderStatus.COMPLETED, domainId: przypisana.domainRow.id, completedAt: new Date() },
            });
            return { ...przypisana, zmienione: zm.count };
          });
          if (!wynik.zmienione) continue;
          zakonczone += 1;
          await this.audit.record({
            action: 'DOMAIN_REGISTRAR_TRANSFER_COMPLETED',
            userId: z.userId,
            details: {
              orderId: z.id,
              domain: z.domainName,
              expiresAt: info.expiresAt ?? null,
              ...(wynik.poprzedniUserId ? { replacedClaimOfUserId: wynik.poprzedniUserId } : {}),
            },
          });
        } else if (info.state === 'failed') {
          if (!z.walletTxId || !z.priceAmount) continue;
          nieudane += 1;
          await this.refundAndFail(z.userId, z, z.walletTxId, new Error('Rejestr odrzucił transfer domeny.'), {
            amount: z.priceAmount.toString(),
            currency: z.currency,
          });
        }
      } catch (e) {
        this.logger.warn(`domknięcie transferu ${z.domainName}: ${(e as Error).message}`);
      }
    }
    return { zakonczone, nieudane };
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

function sanitizeDomainLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .split('.')[0]
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

function sanitizeNameservers(value?: string[]): string[] {
  return (value ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean).slice(0, 8);
}

/** A-14 — rozpoczęte lata do końca ważności domeny (min. 1): za tyle płaci klient przy włączeniu ukrycia. */
export function rozpoczeteLata(expiresAt: Date | null, teraz = new Date()): number {
  if (!expiresAt) return 1;
  const ms = expiresAt.getTime() - teraz.getTime();
  return Math.max(1, Math.ceil(ms / (365.25 * 24 * 3600_000)));
}

/**
 * A-14 — część rejestrów (wiele ccTLD, np. .pl) nie pozwala ukryć danych. OpenProvider nie podaje w dokumentacji
 * stałego kodu tego błędu — rozpoznajemy go po treści (privacy/WPP/„not supported/allowed/available”).
 * ponytail: dopasowanie po tekście; gdy poznamy kod błędu z sandboxa, zamienić na kod.
 */
export function bladWhois(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  // Konto resellera bez podpisanej umowy WPP (sandbox D3 06.10: „Wpp contract is not signed”) — to po naszej
  // stronie, nie ograniczenie rejestru. Wcześniej łapał to wzorzec „wpp” i klient czytał, że rejestr nie pozwala.
  if (/contract is not signed|contract not signed/i.test(msg)) {
    return new ServiceUnavailableException('Ukrycie danych w WHOIS jest chwilowo niedostępne. Opłata wróciła do portfela.');
  }
  if (/privacy|wpp|not (supported|allowed|available)|unsupported/i.test(msg)) {
    return new BadRequestException(
      'Rejestr tej domeny nie pozwala ukryć danych w WHOIS (np. .pl — dane osób prywatnych i tak nie są publikowane).',
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
