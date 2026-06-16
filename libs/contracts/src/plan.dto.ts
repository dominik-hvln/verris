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
}
