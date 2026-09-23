/**
 * Invoice DTOs shared between the API and the panels. Today every invoice is
 * mirrored from Stripe — the customer downloads it via `hostedUrl` (Stripe
 * Hosted Invoice URL) or `pdfUrl`. C-10: own PDF generator is a future task.
 */

export type InvoiceLegalKind = 'FAKTURA_VAT' | 'DOKUMENT_ROZLICZENIOWY';

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';

export interface InvoiceDto {
  id: string;
  number: string;
  status: InvoiceStatus;
  /** Decimal-as-string to preserve precision over the wire. */
  amount: string;
  currency: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  /** PDF wygenerowany przez panel jest w magazynie — do pobrania przez GET billing/invoices/:id/pdf. */
  hasPdf: boolean;
  provider: string | null;
  providerRef: string | null;
  subscriptionId: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  /**
   * FAK-01 — `FAKTURA_VAT` (fakturę wystawił panel) albo
   * `DOKUMENT_ROZLICZENIOWY` (fakturę VAT wystawia program księgowy; jej numer
   * jest w `externalInvoiceNumber`, gdy operator go dopisze).
   */
  rodzajPrawny: InvoiceLegalKind;
  externalInvoiceNumber: string | null;
  externalInvoiceAt: string | null;
}

export interface InvoiceListResponse {
  rows: InvoiceDto[];
  total: number;
  limit: number;
  offset: number;
}
