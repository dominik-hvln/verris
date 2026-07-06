import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Invoice, KsefStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { buildFaXml, FaXmlValidationError } from './fa-xml.builder';
import { buildFa3Xml } from './fa3-xml.builder';
import { KsefClient } from './ksef.client';
import { KsefV2Client } from './ksef-v2.client';
import { InvoicingProvider } from './invoicing-provider.interface';

const BATCH_LIMIT = 25;

/**
 * B-1 — orkiestracja KSeF.
 *
 * Kwalifikacja: faktury własne Verris (provider=null, numeracja VFV/…),
 * wystawione (issuedAt) — Stripe-hosted pozostają NOT_APPLICABLE (Stripe jest
 * wystawcą tych dokumentów; jeśli prawnik zdecyduje inaczej, zmiana = jedna
 * linia w `qualifies()`).
 *
 * Tryb offline (awaria KSeF): wysyłka po prostu zostaje w PENDING i jest
 * ponawiana — faktura PDF i tak trafia do klienta natychmiast, a przepisy
 * przewidują dosłanie po przywróceniu dostępności. REJECTED wymaga
 * interwencji (alert w logu + audyt + widoczne w adminie).
 */
@Injectable()
export class KsefService {
  private readonly logger = new Logger(KsefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Config — z ustawień admina (DB) z fallbackiem env
  // ---------------------------------------------------------------------------

  async isEnabled(): Promise<boolean> {
    const rt = await this.settings.getKsefRuntimeConfig();
    return rt.enabled;
  }

  /** v2 = KSeF 2.0 (/api/v2), v1 = legacy KSeF 1.0 (/api). */
  private currentApiVersion: 'v1' | 'v2' = 'v2';

  private baseUrlForEnv(env: 'test' | 'demo' | 'prod', apiVersion: 'v1' | 'v2'): string {
    const override = this.config.get<string>('KSEF_BASE_URL');
    if (override) return override;
    const host =
      env === 'prod'
        ? 'https://api.ksef.mf.gov.pl'
        : env === 'demo'
          ? 'https://api-demo.ksef.mf.gov.pl'
          : 'https://api-test.ksef.mf.gov.pl';
    // KSeF 2.0 API jest pod /api/v2; legacy 1.0 pod /api.
    if (apiVersion === 'v2') return `${host}/api/v2`;
    // legacy hostname bez sub-„api." (stary interfejs)
    return env === 'prod' ? 'https://ksef.mf.gov.pl/api' : 'https://ksef-test.mf.gov.pl/api';
  }

  async configStatus() {
    const rt = await this.settings.getKsefRuntimeConfig();
    return {
      enabled: rt.enabled,
      env: rt.env,
      apiVersion: rt.apiVersion,
      baseUrl: this.baseUrlForEnv(rt.env, rt.apiVersion),
      nipSet: Boolean(rt.nip),
      tokenSet: Boolean(rt.token),
      // v2 pobiera klucze z API — klucz publiczny w configu wymagany tylko dla v1.
      publicKeySet: rt.apiVersion === 'v2' ? true : Boolean(rt.publicKeyPem),
    };
  }

  private async buildClient(): Promise<InvoicingProvider | null> {
    const rt = await this.settings.getKsefRuntimeConfig();
    this.currentApiVersion = rt.apiVersion;
    if (!rt.nip || !rt.token) return null;
    const baseUrl = this.baseUrlForEnv(rt.env, rt.apiVersion);
    if (rt.apiVersion === 'v2') {
      return new KsefV2Client({
        baseUrl,
        nip: rt.nip.replace(/\D/g, ''),
        token: rt.token,
      });
    }
    // legacy v1 (FA(2)) — wymaga klucza publicznego MF w configu.
    if (!rt.publicKeyPem) return null;
    return new KsefClient({
      baseUrl,
      nip: rt.nip.replace(/\D/g, ''),
      token: rt.token,
      publicKeyPem: rt.publicKeyPem,
    });
  }

  // ---------------------------------------------------------------------------
  // Kwalifikacja nowych faktur (wołane przy finalizacji + przez cron catch-up)
  // ---------------------------------------------------------------------------

  private qualifies(inv: Pick<Invoice, 'provider' | 'issuedAt' | 'netAmount'>): boolean {
    return inv.provider == null && inv.issuedAt != null && inv.netAmount != null;
  }

  /** Oznacza fakturę jako PENDING do wysyłki (idempotentne). */
  async enqueueInvoice(invoiceId: string): Promise<void> {
    if (!(await this.isEnabled())) return;
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || !this.qualifies(inv)) return;
    if (inv.ksefStatus !== KsefStatus.NOT_APPLICABLE) return;
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { ksefStatus: KsefStatus.PENDING },
    });
  }

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------

  /** Co 10 min: dokwalifikuj zaległe, wyślij PENDING, sprawdź SUBMITTED. */
  @Cron('0 */10 * * * *', { name: 'ksef:submit-cycle' })
  async tick(): Promise<void> {
    if (!(await this.isEnabled())) return;

    // Catch-up: faktury sprzed włączenia KSeF / z pominiętym enqueue.
    await this.prisma.invoice.updateMany({
      where: {
        ksefStatus: KsefStatus.NOT_APPLICABLE,
        provider: null,
        issuedAt: { not: null },
        netAmount: { not: null },
      },
      data: { ksefStatus: KsefStatus.PENDING },
    });

    const client = await this.buildClient();
    if (!client) {
      this.logger.warn('KSeF włączony, ale konfiguracja niepełna (NIP/token/klucz publiczny).');
      return;
    }

    const pending = await this.prisma.invoice.findMany({
      where: { ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.SUBMITTED] } },
      orderBy: { issuedAt: 'asc' },
      take: BATCH_LIMIT,
    });
    if (pending.length === 0) return;

    try {
      await client.openSession();
    } catch (err) {
      // Awaria KSeF — tryb offline: nic nie zmieniamy, ponowimy za 10 min.
      this.logger.warn(
        `KSeF niedostępny — faktury pozostają w kolejce (${pending.length}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    let sent = 0;
    let accepted = 0;
    let rejected = 0;
    try {
      for (const inv of pending) {
        try {
          if (inv.ksefStatus === KsefStatus.PENDING) {
            await this.submitOne(client, inv);
            sent += 1;
          } else if (inv.ksefStatus === KsefStatus.SUBMITTED && inv.ksefElementRef) {
            const result = await this.checkOne(client, inv);
            if (result === 'accepted') accepted += 1;
            if (result === 'rejected') rejected += 1;
          }
        } catch (err) {
          // Błąd pojedynczej faktury nie zatrzymuje partii.
          this.logger.error(
            `KSeF: faktura ${inv.number} — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      await client.terminateSession();
    }

    if (sent || accepted || rejected) {
      this.logger.log(`KSeF cycle: sent=${sent} accepted=${accepted} rejected=${rejected}`);
    }
  }

  private async submitOne(client: InvoicingProvider, inv: Invoice): Promise<void> {
    let xml: string;
    try {
      // v2 → FA(3) (obowiązkowy 2026); legacy v1 → FA(2).
      ({ xml } =
        this.currentApiVersion === 'v2'
          ? buildFa3Xml({ invoice: inv, systemInfo: 'Verris Panel' })
          : buildFaXml({ invoice: inv, systemInfo: 'Verris Panel' }));
    } catch (err) {
      if (err instanceof FaXmlValidationError) {
        // Dane faktury niekompletne — REJECTED lokalnie, wymaga poprawy danych.
        await this.markRejected(inv, `Walidacja lokalna: ${err.message}`);
        return;
      }
      throw err;
    }

    try {
      const { elementReferenceNumber } = await client.sendInvoice(xml);
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.SUBMITTED,
          ksefElementRef: elementReferenceNumber,
          ksefSubmittedAt: new Date(),
          ksefError: null,
        },
      });
      await this.audit.record({
        action: 'KSEF_INVOICE_SUBMITTED',
        userId: inv.userId,
        details: { invoiceId: inv.id, number: inv.number, elementReferenceNumber },
      });
    } catch (err) {
      const httpStatus = (err as { httpStatus?: number }).httpStatus;
      if (httpStatus && httpStatus < 500) {
        // 4xx przy wysyłce = problem z dokumentem, nie z dostępnością.
        await this.markRejected(inv, (err as Error).message);
        return;
      }
      throw err; // 5xx / sieć → zostaje PENDING, retry w kolejnym cyklu.
    }
  }

  private async checkOne(
    client: InvoicingProvider,
    inv: Invoice,
  ): Promise<'accepted' | 'rejected' | 'pending'> {
    const status = await client.invoiceStatus(inv.ksefElementRef!);
    if (status.processed && status.ksefReferenceNumber) {
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.ACCEPTED,
          ksefNumber: status.ksefReferenceNumber,
          ksefAcceptedAt: status.acquisitionTimestamp
            ? new Date(status.acquisitionTimestamp)
            : new Date(),
          ksefError: null,
        },
      });
      await this.audit.record({
        action: 'KSEF_INVOICE_ACCEPTED',
        userId: inv.userId,
        details: { invoiceId: inv.id, number: inv.number, ksefNumber: status.ksefReferenceNumber },
      });
      return 'accepted';
    }
    if (status.rejected) {
      await this.markRejected(
        inv,
        `KSeF ${status.statusCode}: ${status.statusDescription ?? 'odrzucono'}`,
      );
      return 'rejected';
    }
    return 'pending';
  }

  private async markRejected(inv: Invoice, reason: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: inv.id },
      data: { ksefStatus: KsefStatus.REJECTED, ksefError: reason.slice(0, 2000) },
    });
    await this.audit.record({
      action: 'KSEF_INVOICE_REJECTED',
      userId: inv.userId,
      details: { invoiceId: inv.id, number: inv.number, reason: reason.slice(0, 500) },
    });
    this.logger.error(`KSeF REJECTED ${inv.number}: ${reason}`);
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async adminOverview() {
    const [counts, recentRejected] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['ksefStatus'],
        _count: { _all: true },
      }),
      this.prisma.invoice.findMany({
        where: { ksefStatus: KsefStatus.REJECTED },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, number: true, ksefError: true, updatedAt: true },
      }),
    ]);
    return {
      config: await this.configStatus(),
      counts: Object.fromEntries(counts.map((c) => [c.ksefStatus, c._count._all])),
      recentRejected: recentRejected.map((r) => ({
        id: r.id,
        number: r.number,
        error: r.ksefError,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  /** Admin: ponów odrzuconą fakturę po poprawie danych. */
  async retryInvoice(invoiceId: string, actorUserId: string) {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { ksefStatus: KsefStatus.PENDING, ksefError: null, ksefElementRef: null },
    });
    await this.audit.record({
      action: 'KSEF_INVOICE_RETRY',
      actorUserId,
      details: { invoiceId },
    });
    return { ok: true as const };
  }
}
