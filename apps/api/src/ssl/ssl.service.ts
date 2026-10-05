import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma, SslOrderStatus, WalletTxType, type SslOrder } from '@verris/database';
import { X509Certificate, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import type { SslPlatneDto, SslProduktAdminDto, SslZamowienieDto, SslZamowRequestDto } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import { PlatformSettingsService, type SslCena } from '../platform-settings/platform-settings.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { sslPlatnyKomunikat, sslPlatnyTemplate, type SslPlatnyRodzaj } from '../mail/templates/hosting-notifications.js';
import { RegistrarProviderFactory, type SslOrderInfo, type SslProduct } from '../domains/registrar.provider.js';
import { NbpFxService } from '../domains/nbp-fx.service.js';
import { parseDomainPricingConfig, toCustomerDomainPrice } from '../domains/domain-pricing.util.js';

/** Adresy, które według dokumentacji resellera zawsze można wskazać do weryfikacji e-mailem. */
export const ADRESY_WERYFIKACJI = ['admin', 'administrator', 'hostmaster', 'postmaster', 'webmaster'] as const;
const DZIEN = 24 * 3600_000;

/**
 * G-08 — sprzedaż płatnych certyfikatów SSL (DV). Kolejność jak przy domenach: zamówienie → obciążenie portfela
 * (klucz idempotencji = id zamówienia) → wystawca; błąd wystawcy = zwrot. Klucz prywatny generujemy u siebie,
 * trzymamy wyłącznie zaszyfrowany i nie wysyłamy nigdzie poza instalacją na koncie klienta.
 */
@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly providers: RegistrarProviderFactory,
    private readonly wallet: WalletLedgerService,
    private readonly settings: PlatformSettingsService,
    private readonly directAdmin: DirectAdminService,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly nbpFx: NbpFxService,
  ) {}

  async panel(userId: string, subscriptionId: string): Promise<SslPlatneDto> {
    await this.usluga(userId, subscriptionId);
    const ceny = await this.settings.getSslPrices();
    const zamowienia = await this.prisma.sslOrder.findMany({
      where: { userId, subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      oferta: Object.entries(ceny)
        .map(([id, c]) => ({ productId: Number(id), name: c.name, wildcard: c.wildcard, priceGross: c.price }))
        .sort((a, b) => Number(a.priceGross) - Number(b.priceGross)),
      zamowienia: zamowienia.map(naDto),
    };
  }

  async zamow(userId: string, actorUserId: string, subscriptionId: string, input: SslZamowRequestDto): Promise<SslZamowienieDto> {
    await this.usluga(userId, subscriptionId);
    const cena = (await this.settings.getSslPrices())[String(input.productId)];
    if (!cena) throw new BadRequestException('Ten certyfikat nie jest dostępny.');
    const domain = input.domain.trim().toLowerCase();
    const konto = await this.directAdmin.listHostingDomainsForSubscription(subscriptionId, userId);
    if (konto.fetchError) throw new BadRequestException('Nie udało się sprawdzić domen konta — spróbuj za chwilę.');
    if (!konto.domains.some((d) => d.name.toLowerCase() === domain)) {
      throw new BadRequestException('Ta domena nie jest przypisana do konta hostingowego tej usługi.');
    }
    let approverEmail: string | null = null;
    if (input.validation === 'EMAIL') {
      approverEmail = (input.approverEmail ?? '').trim().toLowerCase();
      if (!ADRESY_WERYFIKACJI.some((l) => approverEmail === `${l}@${domain}`)) {
        throw new BadRequestException(`Wybierz adres do weryfikacji: ${ADRESY_WERYFIKACJI.map((l) => `${l}@${domain}`).join(', ')}.`);
      }
    }
    // Wystawca przed obciążeniem: brak konfiguracji nie może kosztować klienta.
    const ssl = this.providers.getSsl();
    const hostName = cena.wildcard ? `*.${domain}` : domain;
    const { privateKeyPem, csr } = wygenerujCsr(hostName);

    let order: SslOrder;
    try {
      order = await this.prisma.sslOrder.create({
        data: {
          userId,
          subscriptionId,
          domain,
          wildcard: cena.wildcard,
          productId: input.productId,
          productName: cena.name,
          validation: input.validation,
          approverEmail,
          privateKeyEnc: this.crypto.encrypt(privateKeyPem),
          csr,
          priceAmount: new Prisma.Decimal(cena.price),
        },
      });
    } catch (e) {
      // Indeks częściowy SslOrder_w_toku_key: jedno zamówienie w toku na domenę usługi (dwuklik, dwie karty).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Zamówienie certyfikatu dla tej domeny jest już w toku.');
      }
      throw e;
    }
    await this.audit.record({
      action: 'SSL_ORDER_CREATED',
      userId,
      actorUserId,
      details: { orderId: order.id, domain, hostName, productId: input.productId, priceAmount: cena.price, validation: input.validation },
    });

    let tx;
    try {
      tx = await this.wallet.debit({
        userId,
        amount: cena.price,
        type: WalletTxType.CHARGE_USAGE,
        description: `Certyfikat SSL ${cena.name} — ${hostName} (1 rok)`,
        idempotencyKey: `ssl-order:${order.id}`,
        subscriptionId,
        metadata: { sslOrderId: order.id, domain: hostName, productId: input.productId } as Prisma.InputJsonValue,
      });
    } catch (err) {
      await this.prisma.sslOrder.update({
        where: { id: order.id },
        data: { status: SslOrderStatus.FAILED, lastError: (err as Error).message.slice(0, 1000) },
      });
      if (err instanceof ConflictException) {
        throw new BadRequestException('Brak wystarczających środków w portfelu. Doładuj portfel i spróbuj ponownie.');
      }
      throw err;
    }
    await this.prisma.sslOrder
      .update({ where: { id: order.id }, data: { walletTxId: tx.id } })
      .catch((e) => this.logger.error(`SSL ${order.id}: obciążenie ${tx.id} bez zapisu walletTxId: ${(e as Error).message}`));
    await this.audit.record({ action: 'SSL_ORDER_CHARGED', userId, actorUserId, details: { orderId: order.id, walletTxId: tx.id, amount: cena.price } });

    let providerOrderId: string;
    try {
      providerOrderId = await ssl.sslCreateOrder({
        productId: input.productId,
        years: 1,
        csr,
        hostName,
        validation: input.validation === 'DNS' ? 'dns' : 'email',
        approverEmail,
      });
    } catch (err) {
      await this.zwrot(order, err);
      throw new BadRequestException('Nie udało się zamówić certyfikatu — opłata wróciła do portfela. Spróbuj ponownie później.');
    }
    await this.prisma.sslOrder.update({
      where: { id: order.id },
      data: { status: SslOrderStatus.VALIDATING, providerOrderId },
    });
    await this.audit.record({ action: 'SSL_ORDER_SUBMITTED', userId, actorUserId, details: { orderId: order.id, providerOrderId } });

    // Rekord weryfikacyjny DNS bywa gotowy od razu — wtedy dodajemy go bez czekania na harmonogram.
    const po = await this.sprawdz(order.id).catch((e) => {
      this.logger.warn(`SSL ${order.id}: pierwsze sprawdzenie: ${(e as Error).message}`);
      return null;
    });
    return naDto(po ?? (await this.prisma.sslOrder.findUniqueOrThrow({ where: { id: order.id } })));
  }

  /** Sprawdzenie na żądanie klienta („Sprawdź teraz”). */
  async sprawdzTeraz(userId: string, subscriptionId: string, orderId: string): Promise<SslZamowienieDto> {
    const o = await this.prisma.sslOrder.findFirst({ where: { id: orderId, userId, subscriptionId }, select: { id: true } });
    if (!o) throw new NotFoundException('Zamówienie nie zostało znalezione.');
    try {
      return naDto(await this.sprawdz(o.id));
    } catch (e) {
      this.logger.warn(`SSL ${o.id}: sprawdzenie: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Nie udało się teraz sprawdzić stanu certyfikatu — spróbuj za chwilę.');
    }
  }

  /** Co 10 minut: stan u wystawcy, instalacja wydanych, zwrot za zamówienia porzucone przed wysłaniem. */
  @Cron('*/10 * * * *', { name: 'ssl:orders-sync' })
  async synchronizuj(teraz = Date.now()): Promise<number> {
    const zamowienia = await this.prisma.sslOrder.findMany({
      where: {
        OR: [
          { status: { in: [SslOrderStatus.VALIDATING, SslOrderStatus.ISSUED] } },
          // Przerwane między obciążeniem a wysłaniem (restart API) — klient zapłacił, a zamówienie stoi.
          { status: SslOrderStatus.PENDING, createdAt: { lt: new Date(teraz - 30 * 60_000) } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    for (const o of zamowienia) {
      try {
        if (o.status === SslOrderStatus.PENDING) await this.zwrot(o, new Error('Zamówienie nie zostało wysłane do wystawcy.'));
        else await this.sprawdz(o.id);
      } catch (e) {
        this.logger.warn(`SSL ${o.id}: ${(e as Error).message}`);
      }
    }
    return zamowienia.length;
  }

  async sprawdz(orderId: string): Promise<SslOrder> {
    let o = await this.prisma.sslOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status === SslOrderStatus.VALIDATING && o.providerOrderId) {
      const info = await this.providers.getSsl().sslOrder(o.providerOrderId);
      if (o.validation === 'DNS' && !o.dnsRecordAddedAt && info.dns) o = await this.dodajRekordDns(o, info.dns);
      if (info.state === 'issued') o = await this.wydany(o, info);
      else if (info.state === 'failed') {
        o = await this.zwrot(o, new Error('Wystawca odrzucił zamówienie albo minął czas na weryfikację.'));
        await this.powiadom(o, 'odrzucony');
      }
    }
    if (o.status === SslOrderStatus.ISSUED) o = await this.instaluj(o);
    return o;
  }

  /** Jedno przypomnienie na certyfikat, gdy do wygaśnięcia zostaje ≤ 30 dni (reminderSentAt) — mail i panel. */
  @Cron('20 9 * * *', { name: 'ssl:expiry-reminders' })
  async przypomnienia(teraz = Date.now()): Promise<number> {
    const wygasajace = await this.prisma.sslOrder.findMany({
      where: {
        status: SslOrderStatus.INSTALLED,
        reminderSentAt: null,
        expiresAt: { gt: new Date(teraz), lte: new Date(teraz + 30 * DZIEN) },
      },
      take: 200,
    });
    for (const o of wygasajace) {
      await this.powiadom(o, 'wygasa');
      await this.prisma.sslOrder.update({ where: { id: o.id }, data: { reminderSentAt: new Date(teraz) } });
      await this.audit.record({ action: 'SSL_EXPIRY_REMINDER', userId: o.userId, details: { orderId: o.id, domain: o.domain, expiresAt: o.expiresAt?.toISOString() ?? null } });
    }
    return wygasajace.length;
  }

  // ---------------------------------------------------------------------------
  // Admin — cennik
  // ---------------------------------------------------------------------------

  async produktyAdmin(): Promise<SslProduktAdminDto[]> {
    const [produkty, ceny] = await Promise.all([this.produktyDv(), this.settings.getSslPrices()]);
    const cfg = { ...parseDomainPricingConfig((k) => this.config.get<string>(k)), ...(await this.nbpFx.getRates()) };
    return produkty.map((p) => {
      let suggestedGross: string | null = null;
      try {
        // Ta sama marża, kurs NBP, VAT i zaokrąglenie do ,99 co ceny domen.
        if (p.cost) suggestedGross = toCustomerDomainPrice(p.cost.amount, p.cost.currency, cfg).grossAmount;
      } catch {
        suggestedGross = null;
      }
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        wildcard: p.wildcard,
        costAmount: p.cost?.amount ?? null,
        costCurrency: p.cost?.currency ?? null,
        suggestedGross,
        price: ceny[String(p.id)]?.price ?? null,
      };
    });
  }

  /** Nazwa i wildcard z katalogu wystawcy (nie od przeglądarki); pusta cena = produkt ukryty. */
  async zapiszCeny(prices: Record<string, string | null>, actorUserId: string): Promise<SslProduktAdminDto[]> {
    for (const [id, v] of Object.entries(prices)) {
      if (v?.trim() && !/^\d{1,5}([.,]\d{1,2})?$/.test(v.trim())) {
        throw new BadRequestException(`Niepoprawna cena dla produktu ${id} — podaj kwotę, np. 99,99, albo zostaw puste.`);
      }
    }
    const produkty = await this.produktyDv();
    const cennik: Record<string, SslCena> = {};
    for (const p of produkty) {
      const cena = prices[String(p.id)];
      if (cena && cena.trim()) cennik[String(p.id)] = { price: cena, name: p.name, wildcard: p.wildcard };
    }
    await this.settings.updateSslPrices(cennik, actorUserId);
    return this.produktyAdmin();
  }

  /** v1: tylko DV — pojedyncza domena albo wildcard. OV/EV wymagają weryfikacji firmy (na zapytanie). */
  private async produktyDv(): Promise<SslProduct[]> {
    let produkty: SslProduct[];
    try {
      produkty = await this.providers.getSsl().sslProducts();
    } catch (e) {
      this.logger.warn(`Produkty SSL: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Nie udało się pobrać listy certyfikatów od rejestratora.');
    }
    return produkty.filter((p) => /^(dv|domain_validation)$/i.test(p.category) && (p.wildcard || p.singleDomain));
  }

  // ---------------------------------------------------------------------------

  private async usluga(userId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, select: { id: true } });
    if (!sub) throw new NotFoundException('Service not found');
  }

  private async dodajRekordDns(o: SslOrder, dns: NonNullable<SslOrderInfo['dns']>): Promise<SslOrder> {
    const rekord = rekordWalidacji(o.domain, dns);
    o = await this.prisma.sslOrder.update({ where: { id: o.id }, data: { dnsRecord: rekord } });
    try {
      // Rekord trafia do strefy na naszym serwerze. Gdy domena ma DNS gdzie indziej, klient widzi go w panelu.
      await this.directAdmin.createHostingDnsRecord(o.subscriptionId, o.userId, { domain: o.domain, ...rekord, ttl: 300 });
    } catch (e) {
      const msg = (e as Error).message;
      await this.audit.record({ action: 'SSL_ORDER_DNS_FAILED', userId: o.userId, details: { orderId: o.id, error: msg } });
      return this.prisma.sslOrder.update({ where: { id: o.id }, data: { lastError: `DNS: ${msg}`.slice(0, 1000) } });
    }
    await this.audit.record({ action: 'SSL_ORDER_DNS_ADDED', userId: o.userId, details: { orderId: o.id, ...rekord } });
    return this.prisma.sslOrder.update({ where: { id: o.id }, data: { dnsRecordAddedAt: new Date(), lastError: null } });
  }

  private async wydany(o: SslOrder, info: SslOrderInfo): Promise<SslOrder> {
    const cert = new X509Certificate(info.certificate!);
    // Certyfikat musi pasować do NASZEGO klucza — inaczej instalacja wyłączyłaby stronie HTTPS.
    if (!cert.checkPrivateKey(createPrivateKey(this.crypto.decrypt(o.privateKeyEnc)))) {
      await this.audit.record({ action: 'SSL_ORDER_KEY_MISMATCH', userId: o.userId, details: { orderId: o.id } });
      return this.prisma.sslOrder.update({ where: { id: o.id }, data: { lastError: 'Certyfikat od wystawcy nie pasuje do klucza zamówienia.' } });
    }
    const expiresAt = new Date(cert.validTo);
    await this.prisma.sslOrder.updateMany({
      where: { id: o.id, status: SslOrderStatus.VALIDATING },
      data: { status: SslOrderStatus.ISSUED, certificate: info.certificate, caBundle: info.caBundle, expiresAt, lastError: null },
    });
    await this.audit.record({ action: 'SSL_ORDER_ISSUED', userId: o.userId, details: { orderId: o.id, expiresAt: expiresAt.toISOString() } });
    return this.prisma.sslOrder.findUniqueOrThrow({ where: { id: o.id } });
  }

  /** Instalacja tą samą ścieżką co „Własny certyfikat (PEM)” w panelu; błąd = ponowienie przy kolejnym przebiegu. */
  private async instaluj(o: SslOrder): Promise<SslOrder> {
    try {
      await this.directAdmin.pasteCustomSslCertificate(o.subscriptionId, o.userId, {
        domain: o.domain,
        certificate: o.certificate!,
        privateKey: this.crypto.decrypt(o.privateKeyEnc),
        caBundle: o.caBundle ?? undefined,
      });
    } catch (e) {
      const msg = (e as Error).message;
      await this.audit.record({ action: 'SSL_ORDER_INSTALL_FAILED', userId: o.userId, details: { orderId: o.id, error: msg } });
      return this.prisma.sslOrder.update({ where: { id: o.id }, data: { lastError: msg.slice(0, 1000) } });
    }
    const zm = await this.prisma.sslOrder.updateMany({
      where: { id: o.id, status: SslOrderStatus.ISSUED },
      data: { status: SslOrderStatus.INSTALLED, installedAt: new Date(), lastError: null },
    });
    const po = await this.prisma.sslOrder.findUniqueOrThrow({ where: { id: o.id } });
    if (zm.count) {
      await this.audit.record({ action: 'SSL_ORDER_INSTALLED', userId: o.userId, details: { orderId: o.id, domain: o.domain } });
      await this.powiadom(po, 'zainstalowany');
    }
    return po;
  }

  /** Zwrot (tylko gdy obciążenie istnieje — szukane po kluczu idempotencji) i zamknięcie zamówienia. */
  private async zwrot(o: SslOrder, err: unknown): Promise<SslOrder> {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.error(`SSL ${o.id} (${o.domain}) nieudane, zwrot: ${msg}`);
    const oplata = await this.wallet.findByIdempotencyKey(`ssl-order:${o.id}`);
    if (oplata) {
      try {
        await this.wallet.credit({
          userId: o.userId,
          amount: o.priceAmount.toString(),
          type: WalletTxType.REFUND,
          description: `Zwrot za certyfikat SSL — ${o.domain}`,
          idempotencyKey: `ssl-order-refund:${o.id}`,
          subscriptionId: o.subscriptionId,
          metadata: { sslOrderId: o.id, originalTxId: oplata.id } as Prisma.InputJsonValue,
        });
      } catch (e) {
        this.logger.error(`SSL ${o.id}: zwrot nieudany: ${(e as Error).message} — wymaga ręcznej korekty.`);
      }
    }
    const po = await this.prisma.sslOrder.update({
      where: { id: o.id },
      data: { status: SslOrderStatus.FAILED, lastError: msg.slice(0, 1000) },
    });
    await this.audit.record({ action: 'SSL_ORDER_FAILED', userId: o.userId, details: { orderId: o.id, domain: o.domain, error: msg, refunded: Boolean(oplata) } });
    return po;
  }

  private async powiadom(o: SslOrder, rodzaj: SslPlatnyRodzaj): Promise<void> {
    const host = o.wildcard ? `*.${o.domain}` : o.domain;
    const k = sslPlatnyKomunikat(rodzaj, host, o.expiresAt);
    const link = `/dashboard/services/${o.subscriptionId}?tab=ssl`;
    await this.notifications.create({
      userId: o.userId,
      category: 'SSL',
      severity: rodzaj === 'zainstalowany' ? 'info' : 'warning',
      title: k.tytul,
      body: k.tresc,
      link,
      subscriptionId: o.subscriptionId,
    });
    const user = await this.prisma.user.findUnique({ where: { id: o.userId }, select: { email: true, firstName: true, anonymizedAt: true } });
    if (!user?.email || user.anonymizedAt) return;
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    await this.mailer
      .send({
        ...sslPlatnyTemplate({ to: user.email, firstName: user.firstName, rodzaj, domena: host, wygasa: o.expiresAt, panelUrl, ctaUrl: `${panelUrl}${link}` }),
        userId: o.userId,
        category: 'TRANSACTIONAL',
      })
      .catch((e) => this.logger.warn(`SSL ${o.id}: mail ${rodzaj} nie wyszedł: ${(e as Error).message}`));
  }
}

/** Odpowiedź dla panelu klienta — bez klucza, CSR, certyfikatu i surowych błędów zaplecza. */
export function naDto(o: SslOrder): SslZamowienieDto {
  let problem: string | null = null;
  if (o.status === SslOrderStatus.FAILED) {
    problem = o.walletTxId ? 'Zamówienie nie powiodło się — opłata wróciła do portfela.' : 'Zamówienie nie zostało opłacone.';
  } else if (o.status === SslOrderStatus.VALIDATING && o.lastError?.startsWith('DNS:')) {
    problem = 'Nie udało się dodać rekordu weryfikacyjnego automatycznie — dodaj go w strefie DNS domeny.';
  } else if (o.status === SslOrderStatus.ISSUED && o.lastError) {
    problem = 'Certyfikat jest wydany, ale instalacja na koncie się nie udała — ponowimy ją automatycznie. Jeśli to potrwa, napisz do nas.';
  }
  return {
    id: o.id,
    domain: o.domain,
    wildcard: o.wildcard,
    productName: o.productName,
    status: o.status,
    validation: o.validation === 'EMAIL' ? 'EMAIL' : 'DNS',
    approverEmail: o.approverEmail,
    dnsRecord: (o.dnsRecord as SslZamowienieDto['dnsRecord']) ?? null,
    dnsRecordAdded: Boolean(o.dnsRecordAddedAt),
    priceGross: o.priceAmount.toFixed(2),
    expiresAt: o.expiresAt?.toISOString() ?? null,
    problem,
    createdAt: o.createdAt.toISOString(),
  };
}

/**
 * Rekord weryfikacyjny w naszej strefie: nazwa względna („@”, „_abc”) jak w pozostałych rekordach panelu.
 * ponytail: typ rekordu z wartości — dokumentacja resellera podaje tylko dns_record/dns_value; nazwa hosta
 * (np. …sectigo.com) = CNAME, reszta (hash) = TXT. Potwierdzić w sandboxie na obu wystawcach.
 */
export function rekordWalidacji(domain: string, dns: { record: string; value: string }): { name: string; type: 'CNAME' | 'TXT'; value: string } {
  const fqdn = dns.record.trim().toLowerCase().replace(/\.$/, '').replace(/^\*\./, '');
  const name = fqdn === domain ? '@' : fqdn.endsWith(`.${domain}`) ? fqdn.slice(0, -domain.length - 1) : `${fqdn}.`;
  const value = dns.value.trim();
  const host = /^([a-z0-9_-]+\.)+[a-z]{2,}\.?$/i.test(value);
  return host ? { name, type: 'CNAME', value: value.endsWith('.') ? value : `${value}.` } : { name, type: 'TXT', value };
}

// --- PKCS#10 (CSR) na node:crypto — Node nie ma wbudowanego generatora CSR (RFC 2986) -----------------------
const OID_CN = Buffer.from('0603550403', 'hex'); // 2.5.4.3 commonName
const SHA256_RSA = Buffer.from('300d06092a864886f70d01010b0500', 'hex'); // sha256WithRSAEncryption + NULL

function der(tag: number, body: Buffer): Buffer {
  const n = body.length;
  const dl = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return Buffer.concat([Buffer.from([tag, ...dl]), body]);
}

/** Klucz RSA 2048 + CSR z samym CN (www dokłada wystawca przy certyfikacie na jedną domenę). */
export function wygenerujCsr(commonName: string): { privateKeyPem: string; csr: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const subject = der(0x30, der(0x31, der(0x30, Buffer.concat([OID_CN, der(0x0c, Buffer.from(commonName, 'utf8'))]))));
  const info = der(
    0x30,
    Buffer.concat([Buffer.from([0x02, 0x01, 0x00]), subject, publicKey.export({ type: 'spki', format: 'der' }), Buffer.from([0xa0, 0x00])]),
  );
  const podpis = sign('sha256', info, privateKey);
  const csrDer = der(0x30, Buffer.concat([info, SHA256_RSA, der(0x03, Buffer.concat([Buffer.from([0]), podpis]))]));
  const b64 = csrDer.toString('base64').match(/.{1,64}/g)!.join('\n');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    csr: `-----BEGIN CERTIFICATE REQUEST-----\n${b64}\n-----END CERTIFICATE REQUEST-----\n`,
  };
}
