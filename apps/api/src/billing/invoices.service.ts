import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invoice, InvoiceStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { KsefService } from '../ksef/ksef.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ObjectBuckets } from '../storage/object-storage.types';
import { invoiceIssuedTemplate } from '../mail/templates/invoice-notifications';
import { InvoicePdfService, type SellerSnapshot, type BuyerSnapshot, type InvoiceLineItem } from './invoice-pdf.service';
import { StripeInvoice } from './stripe/stripe.client';

const STRIPE_PROVIDER = 'STRIPE';
/** Stała stawka VAT dla usług hostingowych (PL). */
const DEFAULT_VAT_RATE = 23;

const STRIPE_STATUS_TO_LOCAL: Record<string, InvoiceStatus> = {
  draft: InvoiceStatus.DRAFT,
  open: InvoiceStatus.OPEN,
  paid: InvoiceStatus.PAID,
  void: InvoiceStatus.VOID,
  uncollectible: InvoiceStatus.UNCOLLECTIBLE,
};

export interface InvoiceDto {
  id: string;
  number: string;
  status: InvoiceStatus;
  amount: string;
  currency: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  provider: string | null;
  providerRef: string | null;
  subscriptionId: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceListDto {
  rows: InvoiceDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Reads + upserts for `Invoice` rows. Today every invoice is mirrored from
 * Stripe (we don't generate our own PDFs yet — C-10 follow-up). Customers
 * download invoices via Stripe Hosted Invoice URL.
 *
 * Idempotency: every webhook call upserts on (provider, providerRef). Repeated
 * deliveries of `invoice.paid` for the same Stripe invoice id never duplicate
 * the row.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly storage: ObjectStorageService,
    private readonly pdf: InvoicePdfService,
    private readonly ksef: KsefService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  async listForUser(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<InvoiceListDto> {
    const limit = clamp(options.limit ?? 25, 1, 100);
    const offset = Math.max(0, options.offset ?? 0);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.invoice.count({ where: { userId } }),
    ]);

    return {
      rows: rows.map(toDto),
      total,
      limit,
      offset,
    };
  }

  async getForUser(userId: string, invoiceId: string): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return toDto(invoice);
  }

  // ---------------------------------------------------------------------------
  // Webhook hook (called by BillingService)
  // ---------------------------------------------------------------------------

  /**
   * Idempotent upsert from a Stripe `invoice.*` event. Returns the row + a
   * `created` flag callers can use to decide whether to fan out side effects
   * (audit log, e-mail receipt, etc).
   */
  async upsertFromStripe(
    stripeInvoice: StripeInvoice,
    opts: {
      verrisUserId: string;
      verrisSubscriptionId?: string | null;
    },
  ): Promise<{ invoice: Invoice; created: boolean }> {
    const status = STRIPE_STATUS_TO_LOCAL[stripeInvoice.status] ?? InvoiceStatus.OPEN;
    const totalGross = new Prisma.Decimal(stripeInvoice.total / 100);
    const issuedAt = stripeInvoice.created ? new Date(stripeInvoice.created * 1000) : null;
    const dueAt = stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null;
    const paidAt = stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : status === InvoiceStatus.PAID
        ? new Date()
        : null;

    // Use the (provider, providerRef) compound unique to make this an upsert.
    const existing = await this.prisma.invoice.findUnique({
      where: {
        provider_providerRef: {
          provider: STRIPE_PROVIDER,
          providerRef: stripeInvoice.id,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.invoice.update({
        where: { id: existing.id },
        data: {
          status,
          amount: totalGross,
          currency: stripeInvoice.currency.toUpperCase(),
          hostedUrl: stripeInvoice.hosted_invoice_url,
          pdfUrl: stripeInvoice.invoice_pdf,
          issuedAt,
          dueAt,
          paidAt,
        },
      });

      // If the invoice has just transitioned to PAID and we don't have a
      // Verris-issued PDF yet, generate one now. This covers two cases:
      //   (a) Pre-2.2 invoices that exist as Stripe-mirror only.
      //   (b) Invoices upserted in OPEN status before payment, then paid.
      if (
        status === InvoiceStatus.PAID &&
        !updated.storageKey &&
        !updated.number.startsWith('VFV/')
      ) {
        await this.finalizeAsVerrisInvoice(updated, opts).catch((err) => {
          this.logger.error(
            `finalizeAsVerrisInvoice failed for invoice=${updated.id}: ${(err as Error).message}`,
            (err as Error).stack,
          );
        });
      }

      return { invoice: updated, created: false };
    }

    // Pre-PAID we use a placeholder number so we don't burn a sequence
    // slot for invoices that get voided. The placeholder gets replaced by
    // a real `VFV/YYYY/MM/seq` number on first PAID transition.
    const placeholderNumber = stripeInvoice.number ?? `EH-${stripeInvoice.id}`;
    const isImmediatelyPaid = status === InvoiceStatus.PAID;
    const number = isImmediatelyPaid
      ? await this.allocateInvoiceNumber(issuedAt ?? new Date())
      : placeholderNumber;

    const created = await this.prisma.invoice.create({
      data: {
        userId: opts.verrisUserId,
        subscriptionId: opts.verrisSubscriptionId ?? null,
        number,
        status,
        amount: totalGross,
        currency: stripeInvoice.currency.toUpperCase(),
        provider: STRIPE_PROVIDER,
        providerRef: stripeInvoice.id,
        hostedUrl: stripeInvoice.hosted_invoice_url,
        pdfUrl: stripeInvoice.invoice_pdf,
        issuedAt,
        dueAt,
        paidAt,
      },
    });

    await this.audit.record({
      action: 'INVOICE_CREATED',
      userId: opts.verrisUserId,
      details: {
        invoiceId: created.id,
        provider: STRIPE_PROVIDER,
        providerRef: stripeInvoice.id,
        amount: totalGross.toFixed(2),
        currency: stripeInvoice.currency.toUpperCase(),
        status,
        number,
      },
    });

    if (isImmediatelyPaid) {
      // Generate the Verris VAT PDF + email asynchronously. Failure should
      // never break the webhook (`handleInvoicePaid` already reads `created`
      // before invoking us). Errors are audited so admins can retry via
      // an admin endpoint later.
      await this.finalizeAsVerrisInvoice(created, opts).catch((err) => {
        this.logger.error(
          `finalizeAsVerrisInvoice failed for invoice=${created.id}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      });
    }

    return { invoice: created, created: true };
  }

  // ---------------------------------------------------------------------------
  // VAT PDF generation + email (Sprint 2.2)
  // ---------------------------------------------------------------------------

  /**
   * Allocates the next sequence number for `VFV/YYYY/MM/{seq}`.
   *
   * Atomic via Postgres `INSERT ... ON CONFLICT DO UPDATE RETURNING seq` so
   * concurrent invoice creations never collide. Sequence resets monthly.
   */
  private async allocateInvoiceNumber(reference: Date): Promise<string> {
    const year = reference.getFullYear();
    const month = reference.getMonth() + 1;

    // Prisma doesn't expose ON CONFLICT RETURNING natively, but we can use a
    // raw query; alternatively a single transaction with findUnique + upsert
    // works because `(year, month)` is unique. We pick the simpler raw query.
    const rows = await this.prisma.$queryRaw<Array<{ seq: number }>>`
      INSERT INTO "InvoiceCounter" ("id", "year", "month", "seq", "updatedAt")
      VALUES (gen_random_uuid(), ${year}, ${month}, 1, NOW())
      ON CONFLICT ("year", "month")
      DO UPDATE SET "seq" = "InvoiceCounter"."seq" + 1, "updatedAt" = NOW()
      RETURNING "seq";
    `;
    const seq = rows[0]?.seq ?? 1;
    const monthStr = month.toString().padStart(2, '0');
    const seqStr = seq.toString().padStart(4, '0');
    return `VFV/${year}/${monthStr}/${seqStr}`;
  }

  /**
   * Replaces the Stripe-mirror placeholder with a Verris-issued VAT
   * invoice: assigns proper VFV/... number, calculates net/VAT split,
   * captures seller/buyer snapshots, generates PDF, uploads to MinIO,
   * sends invoice-issued email with download link.
   *
   * Idempotent: re-running is safe — the invoice number is reused if
   * already a VFV/... and the PDF is regenerated only if `storageKey` is
   * null. Email sending is skipped if invoice already has `storageKey`
   * (i.e., a previous attempt completed).
   */
  private async finalizeAsVerrisInvoice(
    invoice: Invoice,
    opts: { verrisUserId: string },
  ): Promise<void> {
    if (invoice.storageKey) return; // already finalized

    // 1) Assign VFV/... number if not already one.
    let number = invoice.number;
    if (!number.startsWith('VFV/')) {
      number = await this.allocateInvoiceNumber(invoice.issuedAt ?? new Date());
    }

    // 2) Compute VAT split (assuming 23% inclusive on totalGross).
    const totalGrossDec = invoice.amount;
    const vatRate = DEFAULT_VAT_RATE;
    const factor = new Prisma.Decimal(100).plus(vatRate); // 123 for VAT 23
    const totalNetDec = totalGrossDec.mul(100).dividedBy(factor).toDecimalPlaces(2);
    const totalVatDec = totalGrossDec.minus(totalNetDec).toDecimalPlaces(2);

    // 3) Snapshot seller + buyer. Seller data comes from admin settings
    //    (PlatformSetting) with env fallback — edytowalne w panelu admina.
    const seller = await this.buildSellerSnapshot();
    const buyer = await this.buildBuyerSnapshot(opts.verrisUserId);

    // 4) Build line items. Today we mirror Stripe's "single line per invoice"
    //    semantics — invoices for subscription renewals always have one
    //    primary item (the subscription itself). Future: extract Stripe
    //    `invoice.lines.data[]` for itemized invoices (proration, addons).
    const lineLabel = await this.buildLineItemLabel(invoice);
    const lineItems: InvoiceLineItem[] = [
      {
        name: lineLabel,
        quantity: 1,
        unitNet: totalNetDec.toFixed(2),
        vatRate,
        totalNet: totalNetDec.toFixed(2),
        totalVat: totalVatDec.toFixed(2),
        totalGross: totalGrossDec.toFixed(2),
      },
    ];

    // 5) Generate PDF.
    const pdfBytes = await this.pdf.render({
      number,
      issuedAt: invoice.issuedAt ?? new Date(),
      saleDate: invoice.paidAt ?? invoice.issuedAt ?? new Date(),
      dueAt: invoice.dueAt ?? invoice.paidAt ?? new Date(),
      isPaid: true,
      paymentMethodLabel: this.paymentMethodLabel(invoice),
      currency: (invoice.currency.toUpperCase() as 'PLN' | 'EUR' | 'USD') ?? 'PLN',
      seller,
      buyer,
      lineItems,
      totalNet: totalNetDec.toFixed(2),
      totalVat: totalVatDec.toFixed(2),
      totalGross: totalGrossDec.toFixed(2),
      vatRate,
    });

    // 6) Upload to MinIO `verris-invoices`. Path layout:
    //    {userId}/{year}/{month}/{number}.pdf
    const issued = invoice.issuedAt ?? new Date();
    const storageKey = `${opts.verrisUserId}/${issued.getFullYear()}/${(issued.getMonth() + 1)
      .toString()
      .padStart(2, '0')}/${number.replace(/\//g, '-')}.pdf`;

    await this.storage.putObject(
      ObjectBuckets.INVOICES,
      storageKey,
      Buffer.from(pdfBytes),
      {
        contentType: 'application/pdf',
        originalFilename: `${number.replace(/\//g, '-')}.pdf`,
        custom: {
          userid: opts.verrisUserId,
          invoiceid: invoice.id,
          number,
        },
      },
    );

    // 7) Persist updates atomically.
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        number,
        netAmount: totalNetDec,
        vatAmount: totalVatDec,
        vatRate: new Prisma.Decimal(vatRate),
        sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
        buyerSnapshot: buyer as unknown as Prisma.InputJsonValue,
        lineItems: lineItems as unknown as Prisma.InputJsonValue,
        storageKey,
      },
    });

    await this.audit.record({
      action: 'INVOICE_PDF_GENERATED',
      userId: opts.verrisUserId,
      details: {
        invoiceId: invoice.id,
        number,
        sizeBytes: pdfBytes.byteLength,
        storageKey,
      },
    });

    // 8b) B-1 — kwalifikacja do KSeF (no-op gdy KSEF_ENABLED!=1).
    void this.ksef.enqueueInvoice(updated.id).catch((err) => {
      this.logger.warn(
        `KSeF enqueue failed for invoice=${invoice.id}: ${(err as Error).message}`,
      );
    });

    // 8) Email — non-blocking; if it fails we keep going (invoice is
    //    already in DB + MinIO, customer can grab from panel).
    void this.sendInvoiceIssuedEmail(updated, opts.verrisUserId).catch((err) => {
      this.logger.warn(
        `sendInvoiceIssuedEmail failed for invoice=${invoice.id}: ${(err as Error).message}`,
      );
    });
  }

  private async buildSellerSnapshot(): Promise<SellerSnapshot> {
    const c = await this.platformSettings.getSellerCompany();
    return {
      name: c.name || (this.config.get<string>('VERRIS_COMPANY_NAME') ?? 'Verris Sp. z o.o.'),
      nip: c.nip || (this.config.get<string>('VERRIS_COMPANY_NIP') ?? '0000000000'),
      address: c.address || (this.config.get<string>('VERRIS_COMPANY_ADDRESS') ?? '— adres —'),
      city: c.city || (this.config.get<string>('VERRIS_COMPANY_CITY') ?? 'Warszawa'),
      postalCode: c.postalCode || (this.config.get<string>('VERRIS_COMPANY_POSTAL') ?? '00-000'),
      country: c.country || 'PL',
      email: c.email || (this.config.get<string>('VERRIS_COMPANY_EMAIL') ?? 'kontakt@verris.pl'),
      bankAccount: c.bankAccount || undefined,
      regon: c.regon || undefined,
      krs: c.krs || undefined,
    };
  }

  private async buildBuyerSnapshot(userId: string): Promise<BuyerSnapshot> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        nip: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
      },
    });
    if (!user) {
      // Should never happen — webhooks resolve the user before calling us.
      return { name: '—', email: '—' };
    }
    const personalName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const name = user.companyName?.trim() || personalName || user.email;
    return {
      name,
      nip: user.nip ?? undefined,
      address: user.address ?? undefined,
      city: user.city ?? undefined,
      postalCode: user.postalCode ?? undefined,
      country: user.country ?? 'PL',
      email: user.email,
    };
  }

  private async buildLineItemLabel(invoice: Invoice): Promise<string> {
    if (invoice.subscriptionId) {
      const sub = await this.prisma.subscription.findUnique({
        where: { id: invoice.subscriptionId },
        include: { plan: true, account: true },
      });
      if (sub) {
        const planName = sub.plan?.name ?? 'Hosting';
        const interval = sub.interval === 'MONTH' ? 'miesięczna' : 'roczna';
        return sub.account?.domain
          ? `${planName} — subskrypcja ${interval} (${sub.account.domain})`
          : `${planName} — subskrypcja ${interval}`;
      }
    }
    return 'Usługa hostingowa Verris';
  }

  private paymentMethodLabel(invoice: Invoice): string {
    if (invoice.provider === 'STRIPE') return 'Karta płatnicza (Stripe)';
    return 'Portfel Verris';
  }

  private async sendInvoiceIssuedEmail(invoice: Invoice, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;
    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';

    const message = invoiceIssuedTemplate({
      to: user.email,
      firstName: user.firstName,
      number: invoice.number,
      amount: invoice.amount.toFixed(2),
      currency: invoice.currency,
      issuedAt: invoice.issuedAt ?? new Date(),
      paidAt: invoice.paidAt,
      panelUrl,
      invoiceUrl: `${panelUrl}/dashboard/billing/invoices/${invoice.id}`,
    });
    await this.mailer.send({ ...message, fromRole: 'NOREPLY', category: 'TRANSACTIONAL' });
  }

  // ---------------------------------------------------------------------------
  // PDF download (controller calls this)
  // ---------------------------------------------------------------------------

  async openPdfStream(
    userId: string,
    invoiceId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; filename: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      select: { storageKey: true, number: true, hostedUrl: true },
    });
    if (!invoice) throw new NotFoundException('Faktura nie znaleziona');
    if (!invoice.storageKey) {
      // Pre-2.2 invoices may only have Stripe URL — caller should redirect.
      throw new NotFoundException(
        invoice.hostedUrl
          ? 'PDF nie został jeszcze wygenerowany — użyj linku Stripe do pobrania.'
          : 'PDF nie jest jeszcze gotowy. Spróbuj za chwilę.',
      );
    }
    const stream = await this.storage.getObjectStream(
      ObjectBuckets.INVOICES,
      invoice.storageKey,
    );
    return {
      stream,
      filename: `${invoice.number.replace(/\//g, '-')}.pdf`,
    };
  }

  // ---------------------------------------------------------------------------
  // Sprint 4 / R-10 — admin/staff list, detail, export, PDF download
  // ---------------------------------------------------------------------------

  async listForAdmin(filters: AdminInvoiceFilters): Promise<AdminInvoiceListDto> {
    const { where, totalCount, rows } = await this.executeAdminQuery(filters);
    return {
      rows: rows.map((row) => toAdminDto(row)),
      total: totalCount,
      limit: where.take,
      offset: where.skip,
      filters: {
        userId: filters.userId ?? null,
        statuses: filters.statuses ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
        search: filters.search ?? null,
      },
    };
  }

  async getForAdmin(invoiceId: string): Promise<AdminInvoiceDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, companyName: true } },
        subscription: {
          select: {
            id: true,
            plan: { select: { name: true, slug: true } },
            account: { select: { domain: true } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Faktura nie znaleziona');
    return toAdminDto(invoice);
  }

  async openAdminPdfStream(
    invoiceId: string,
    auditCtx: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ): Promise<{ stream: NodeJS.ReadableStream; filename: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, storageKey: true, number: true, hostedUrl: true, userId: true },
    });
    if (!invoice) throw new NotFoundException('Faktura nie znaleziona');
    if (!invoice.storageKey) {
      throw new NotFoundException(
        invoice.hostedUrl
          ? 'PDF nie został wygenerowany — użyj linku Stripe Hosted.'
          : 'PDF nie jest jeszcze gotowy.',
      );
    }
    await this.audit.record({
      action: 'ADMIN_INVOICE_PDF_DOWNLOADED',
      userId: invoice.userId,
      actorUserId: auditCtx.actorUserId,
      ipAddress: auditCtx.ipAddress ?? undefined,
      userAgent: auditCtx.userAgent ?? undefined,
      details: { invoiceId: invoice.id, number: invoice.number },
    });
    const stream = await this.storage.getObjectStream(
      ObjectBuckets.INVOICES,
      invoice.storageKey,
    );
    return {
      stream,
      filename: `${invoice.number.replace(/\//g, '-')}.pdf`,
    };
  }

  async exportCsvForAdmin(
    filters: AdminInvoiceFilters,
    auditCtx: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ): Promise<string> {
    const { where, rows } = await this.executeAdminQuery({
      ...filters,
      limit: 10000,
      offset: 0,
    });

    await this.audit.record({
      action: 'ADMIN_INVOICES_CSV_EXPORTED',
      actorUserId: auditCtx.actorUserId,
      ipAddress: auditCtx.ipAddress ?? undefined,
      userAgent: auditCtx.userAgent ?? undefined,
      details: {
        rowsExported: rows.length,
        filters: {
          userId: filters.userId ?? null,
          statuses: filters.statuses ?? null,
          from: filters.from?.toISOString() ?? null,
          to: filters.to?.toISOString() ?? null,
          search: filters.search ?? null,
        },
      },
    });

    return buildCsv(rows.map((row) => toAdminDto(row)));
    void where;
  }

  private async executeAdminQuery(
    filters: AdminInvoiceFilters,
  ): Promise<{
    where: { take: number; skip: number };
    rows: AdminInvoiceWithRelations[];
    totalCount: number;
  }> {
    const limit = clamp(filters.limit ?? 50, 1, 10000);
    const offset = Math.max(0, filters.offset ?? 0);

    const where: Prisma.InvoiceWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }
    if (filters.search) {
      const needle = filters.search.trim();
      where.OR = [
        { number: { contains: needle, mode: 'insensitive' } },
        { providerRef: { contains: needle, mode: 'insensitive' } },
        { user: { email: { contains: needle, mode: 'insensitive' } } },
        { user: { companyName: { contains: needle, mode: 'insensitive' } } },
        { user: { firstName: { contains: needle, mode: 'insensitive' } } },
        { user: { lastName: { contains: needle, mode: 'insensitive' } } },
      ];
    }

    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { email: true, firstName: true, lastName: true, companyName: true } },
          subscription: {
            select: {
              id: true,
              plan: { select: { name: true, slug: true } },
              account: { select: { domain: true } },
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { where: { take: limit, skip: offset }, rows, totalCount };
  }
}

// ---------------------------------------------------------------------------
// Admin DTOs (Sprint 4 / R-10)
// ---------------------------------------------------------------------------

export interface AdminInvoiceFilters {
  search?: string;
  userId?: string;
  statuses?: InvoiceStatus[];
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AdminInvoiceDto extends InvoiceDto {
  user: {
    id: string;
    email: string;
    name: string | null;
    companyName: string | null;
  };
  subscription: {
    id: string;
    planName: string | null;
    planSlug: string | null;
    domain: string | null;
  } | null;
  hasVerrisPdf: boolean;
}

export interface AdminInvoiceListDto {
  rows: AdminInvoiceDto[];
  total: number;
  limit: number;
  offset: number;
  filters: {
    userId: string | null;
    statuses: InvoiceStatus[] | null;
    from: string | null;
    to: string | null;
    search: string | null;
  };
}

type AdminInvoiceWithRelations = Invoice & {
  userId: string;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };
  subscription:
    | (null
    | {
        id: string;
        plan: { name: string; slug: string } | null;
        account: { domain: string } | null;
      });
};

function toAdminDto(row: AdminInvoiceWithRelations): AdminInvoiceDto {
  const base = toDto(row);
  const personal = [row.user.firstName, row.user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || null;
  return {
    ...base,
    user: {
      id: row.userId,
      email: row.user.email,
      name: personal,
      companyName: row.user.companyName,
    },
    subscription: row.subscription
      ? {
          id: row.subscription.id,
          planName: row.subscription.plan?.name ?? null,
          planSlug: row.subscription.plan?.slug ?? null,
          domain: row.subscription.account?.domain ?? null,
        }
      : null,
    hasVerrisPdf: !!row.storageKey,
  };
}

function buildCsv(rows: AdminInvoiceDto[]): string {
  const header = [
    'numer',
    'status',
    'kwota_brutto',
    'kwota_kredytow',
    'waluta',
    'klient_email',
    'klient_nazwa',
    'klient_firma',
    'plan',
    'domena',
    'wystawiona',
    'oplacona',
    'utworzona',
    'provider',
    'provider_ref',
    'pdf_verris',
    'hosted_url',
  ];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.number,
        r.status,
        r.amount,
        r.currency === 'PLN' ? r.amount : '',
        r.currency,
        r.user.email,
        r.user.name ?? '',
        r.user.companyName ?? '',
        r.subscription?.planName ?? '',
        r.subscription?.domain ?? '',
        r.issuedAt ?? '',
        r.paidAt ?? '',
        r.createdAt,
        r.provider ?? '',
        r.providerRef ?? '',
        r.hasVerrisPdf ? 'tak' : 'nie',
        r.hostedUrl ?? '',
      ]
        .map(csvEscape)
        .join(';'),
    );
  }
  return lines.join('\n');
}

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toDto(invoice: Invoice): InvoiceDto {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    amount: invoice.amount.toFixed(2),
    currency: invoice.currency,
    hostedUrl: invoice.hostedUrl,
    pdfUrl: invoice.pdfUrl,
    provider: invoice.provider,
    providerRef: invoice.providerRef,
    subscriptionId: invoice.subscriptionId,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueAt: invoice.dueAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
