/**
 * Rodzina produktu planu (enum ProductKind w bazie). EMAIL_MARKETING i KREATOR_PRO to produkty aplikacyjne:
 * bez konta na serwerze i bez domeny. Etykiety: PRODUCT_KIND_PL (etykiety.ts).
 */
export type ProductKind = 'HOSTING' | 'EMAIL' | 'EMAIL_MARKETING' | 'KREATOR_PRO';

export interface PlanDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  ioLimitKbps: number;
  iopsLimit: number;
  entryProcesses: number;
  nprocLimit: number;
  includedTransferGb: number | null;
  /** Decimal-as-string to preserve precision over the wire. */
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  /** O-1 — free trial length in days. 0 = no trial available. */
  trialDays: number;
  /** P-1b / EMM / paczka 121 — 'HOSTING' (web), 'EMAIL' (mailbox), 'EMAIL_MARKETING' (newsletter), 'KREATOR_PRO' (abonament kreatora). */
  productKind: ProductKind;
  /** EMM — limity pakietu e-mail marketingu (null = bez limitu; dla innych produktów null). */
  emmMaxContacts?: number | null;
  emmMonthlySends?: number | null;
  /** SUP-5 — guaranteed support first-response time in hours (0 = no promise). */
  supportSlaHours: number;
}
