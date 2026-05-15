import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Invoice, InvoiceStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { StripeInvoice } from './stripe/stripe.client';

const STRIPE_PROVIDER = 'STRIPE';

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
    const total = new Prisma.Decimal(stripeInvoice.total / 100);
    const issuedAt = stripeInvoice.created
      ? new Date(stripeInvoice.created * 1000)
      : null;
    const dueAt = stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null;
    const paidAt = stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : status === InvoiceStatus.PAID
        ? new Date()
        : null;
    const number = stripeInvoice.number ?? `EH-${stripeInvoice.id}`;

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
          amount: total,
          currency: stripeInvoice.currency.toUpperCase(),
          hostedUrl: stripeInvoice.hosted_invoice_url,
          pdfUrl: stripeInvoice.invoice_pdf,
          issuedAt,
          dueAt,
          paidAt,
          number,
        },
      });
      return { invoice: updated, created: false };
    }

    const created = await this.prisma.invoice.create({
      data: {
        userId: opts.verrisUserId,
        subscriptionId: opts.verrisSubscriptionId ?? null,
        number,
        status,
        amount: total,
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
        amount: total.toFixed(2),
        currency: stripeInvoice.currency.toUpperCase(),
        status,
      },
    });

    return { invoice: created, created: true };
  }
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
