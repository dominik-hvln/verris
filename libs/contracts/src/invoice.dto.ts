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

/**
 * K4 (PB-53.6) — proforma wystawiona przez obsługę, z płatnością w panelu klienta (apps/api/src/billing/proforma.service.ts).
 * Proforma nie jest dokumentem księgowym; po zapłacie dokument za wpłatę jest w `faktura`.
 */
export type ProformaStatus = 'WYSTAWIONA' | 'OPLACONA' | 'ANULOWANA';

export const PROFORMA_STATUS_PL: Record<ProformaStatus, string> = {
  WYSTAWIONA: 'Do zapłaty',
  OPLACONA: 'Opłacona',
  ANULOWANA: 'Anulowana',
};

export interface ProformaDto {
  id: string;
  /** PRO/RRRR/MM/NNNN — seria rozłączna z seriami dokumentów sprzedaży. */
  numer: string;
  status: ProformaStatus;
  /** Brutto do zapłaty; netto i VAT jak w dokumencie za wpłatę. Decimal jako string. */
  kwota: string;
  netto: string;
  vat: string;
  waluta: string;
  wystawiono: string;
  termin: string;
  oplacono: string | null;
  anulowano: string | null;
  pozycje: Array<{ nazwa: string; brutto: string }>;
  subscriptionId: string | null;
  /** Dokument za wpłatę (gdy powstał). */
  faktura: { id: string; number: string } | null;
}

export interface ProformaOperatoraDto extends ProformaDto {
  powodAnulowania: string | null;
  wystawil: string | null;
}
