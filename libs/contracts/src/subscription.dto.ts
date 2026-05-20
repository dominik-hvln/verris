export type BillingInterval = 'MONTH' | 'YEAR';

export type SubscriptionStatus =
  | 'PENDING_PAYMENT'
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELED'
  | 'EXPIRED';

export type SubscriptionPaymentSource = 'STRIPE_CARD' | 'WALLET' | 'MANUAL';

export type AccountStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface CreateSubscriptionInput {
  planId: string;
  interval: BillingInterval;
  paymentSource: SubscriptionPaymentSource;
  domain: string;
  preferredRegion?: string;
  autoscalingEnabled?: boolean;
  ecoModeEnabled?: boolean;
  /** Rabat % na usługę (tylko płatność z portfela). */
  promoCode?: string;
}

export interface PreviewSubscriptionPromoInput {
  planId: string;
  interval: BillingInterval;
  code: string;
}

export interface PreviewSubscriptionPromoResult {
  code: string;
  percent: number;
  listPrice: string;
  discountedAmount: string;
  savingsAmount: string;
  appliesToRenewals: boolean;
  description: string | null;
}

export type ProvisioningStage =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'failed'
  | 'completed';

export interface ProvisioningProgressDto {
  stage: ProvisioningStage;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export interface ServiceSummaryDto {
  id: string;
  status: SubscriptionStatus;
  planSlug: string;
  planName: string;
  interval: BillingInterval;
  priceAmount: string;
  currency: string;
  currentPeriodEnd: string | null;
  ecoModeEnabled: boolean;
  autoscalingEnabled: boolean;
  account: ServiceAccountSummaryDto | null;
  /** Sprint 5 / R-11+B-7 — postęp provisioningu widoczny dla klienta. */
  provisioning: ProvisioningProgressDto | null;
  /** V-01 — service health score shown in client hosting UX. */
  health: ServiceHealthSummaryDto;
  /** V-05 — conservative plan/autoscaling recommendations. */
  recommendations: ServiceRecommendationDto[];
}

export interface ServiceHealthSummaryDto {
  score: number;
  label: 'healthy' | 'attention' | 'critical';
  checkedAt: string | null;
  checks: {
    dnsOk: boolean | null;
    tlsOk: boolean | null;
    backupFresh: boolean | null;
    lveOk: boolean | null;
    phpOk: boolean | null;
    mailOk: boolean | null;
  };
}

export interface ServiceRecommendationDto {
  type: 'autoscaling' | 'plan' | 'domain' | 'backup';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
}

export interface ServiceAccountSummaryDto {
  id: string;
  domain: string;
  daUsername: string;
  status: AccountStatus;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  scaledCpu: number;
  scaledRamMb: number;
  scaledDiskMb: number;
  server: { id: string; name: string | null; region: string | null } | null;
}

export interface SubscriptionEventDto {
  id: string;
  type: string;
  details: unknown;
  createdAt: string;
}

export interface ServiceDetailsDto extends Omit<ServiceSummaryDto, 'planSlug' | 'planName'> {
  paymentSource: SubscriptionPaymentSource;
  plan: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
  };
  currentPeriodStart: string | null;
  autoscalingMaxCost: string;
  events: SubscriptionEventDto[];
}

export interface CreateSubscriptionResponse {
  subscription: {
    id: string;
    status: SubscriptionStatus;
    planId: string;
    interval: BillingInterval;
    priceAmount: string;
    currency: string;
  };
  /** Returned only when the panel must redirect the user (e.g. Stripe Checkout). */
  checkoutRedirectUrl?: string;
  provisioning?: {
    accountId: string;
    daUsername: string;
    daPassword: string;
    serverId: string;
    domain: string;
  };
  /** Gdy true, konto tworzy kolejka Redis/BullMQ — odśwież usługę aż status będzie ACTIVE. */
  provisioningQueued?: boolean;
}

/** GET /services/:id/hosting-domains — domeny powiązane z kontem DA (DirectAdmin). */
export interface HostingDomainsResponseDto {
  domains: { name: string }[];
  daUsername: string | null;
  /** Główna domena konta wg bazy Verris (porównanie z listą DA). */
  primaryDomain: string | null;
  fetchError: string | null;
}

/** GET /services/:id/hosting-databases — bazy MySQL z CMD_API_DATABASES. */
export interface HostingMysqlDatabasesResponseDto {
  databases: { name: string }[];
  daUsername: string | null;
  fetchError: string | null;
}

/** GET /services/:id/hosting-da-links — adresy absolutne do stron DA (File Manager, SSL, bazy). */
export interface HostingDaLinksResponseDto {
  panelBaseUrl: string;
  databasesUrl: string;
  sslUrl: string;
  fileManagerUrl: string;
  /** Podpowiedź dla klonów/subdomen — ekran konfiguracji domeny w DA. */
  stagingHint: string;
  fetchError: string | null;
}

export interface HostingDnsRecordDto {
  id: string;
  name: string;
  type: string;
  value: string;
  ttl: number | null;
}

export interface HostingDnsRecordsResponseDto {
  domain: string | null;
  records: HostingDnsRecordDto[];
  fetchError: string | null;
}

export interface HostingFtpAccountDto {
  id: string;
  username: string;
  path: string;
  suspended: boolean;
}

export interface HostingFtpAccountsResponseDto {
  rows: HostingFtpAccountDto[];
  fetchError: string | null;
}

export interface HostingEmailAccountDto {
  id: string;
  email: string;
  quotaMb: number | null;
}

export interface HostingEmailAccountsResponseDto {
  rows: HostingEmailAccountDto[];
  fetchError: string | null;
}

export interface HostingCronJobDto {
  id: string;
  schedule: string;
  command: string;
}

export interface HostingCronJobsResponseDto {
  rows: HostingCronJobDto[];
  fetchError: string | null;
}

export interface HostingSslRowDto {
  id: string;
  domain: string;
  issuer: string;
  status: string;
}

export interface HostingSslResponseDto {
  rows: HostingSslRowDto[];
  fetchError: string | null;
}

/** POST /services/:id/hosting-ssl/letsencrypt */
export interface HostingSslLetsencryptRequestDto {
  domain: string;
  includeWww?: boolean;
}

/** POST /services/:id/hosting-ssl/paste */
export interface HostingSslPasteRequestDto {
  domain: string;
  certificate: string;
  privateKey: string;
  caBundle?: string;
}

export type HostingSslMutationOkDto = { ok: true };

export interface HostingBackupRowDto {
  id: string;
  fileName: string;
}

export interface HostingBackupsResponseDto {
  rows: HostingBackupRowDto[];
  fetchError: string | null;
}
