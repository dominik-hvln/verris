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
  score: number | null;
  label: 'healthy' | 'attention' | 'critical' | 'pending';
  checkedAt: string | null;
  /** Krótki opis na podstawie realnych checków (nie domyślny placeholder). */
  summary?: string;
  checks: {
    dnsOk: boolean | null;
    tlsOk: boolean | null;
    backupFresh: boolean | null;
    lveOk: boolean | null;
    /** Panel DirectAdmin (:2222) — zaufany certyfikat TLS. */
    panelTlsOk: boolean | null;
    /** Serwer poczty węzła odpowiada (IMAPS/SMTPS). */
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

export type ForecastResource = 'CPU' | 'RAM' | 'DISK' | 'IO';
export type ForecastTrend = 'up' | 'down' | 'flat' | 'unknown';
export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface ServiceForecastResourceDto {
  resource: ForecastResource;
  currentPct: number | null;
  predictedPct: number | null;
  trend: ForecastTrend;
  daysToLimit: number | null;
  note?: string | null;
}

export interface ServiceForecastDto {
  generatedAt: string;
  /** false when the AI provider is not configured or there is too little data. */
  available: boolean;
  unavailableReason?: string | null;
  confidence: ForecastConfidence;
  horizonDays: number;
  summary: string;
  resources: ServiceForecastResourceDto[];
  recommendations: string[];
}

/** A single used/limit metric. `limit === null` means unlimited (∞). */
export interface ConnectionMetricDto {
  used: number | null;
  limit: number | null;
}

/** GET /services/:id/connection-info — dane dostępowe i limity konta hostingowego. */
export interface ServiceConnectionInfoDto {
  ipv4: string | null;
  ftpHost: string | null;
  mailHost: string | null;
  sshEnabled: boolean | null;
  sshHost: string | null;
  sshPort: number | null;
  nameservers: string[];
  /** Wszystkie wartości w MB. */
  diskMb: ConnectionMetricDto;
  /** Transfer miesięczny w MB. */
  bandwidthMb: ConnectionMetricDto;
  emails: ConnectionMetricDto;
  ftpAccounts: ConnectionMetricDto;
  databases: ConnectionMetricDto;
  inodes: ConnectionMetricDto;
  fetchError: string | null;
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

/** GET /services/:id/hosting-da-links — adresy absolutne do stron DA (Evolution skin). */
export interface HostingDaLinksResponseDto {
  panelBaseUrl: string;
  /** Hostname do wyświetlenia (np. node-pl-01.verris.pl) — bez portu. */
  panelDisplayHost: string;
  databasesUrl: string;
  sslUrl: string;
  fileManagerUrl: string;
  /** Lista domen w panelu Evolution. */
  domainsUrl: string;
  /** Strefa DNS głównej domeny usługi. */
  dnsUrl: string;
  /** Ustawienia głównej domeny (staging, subdomeny). */
  domainManageUrl: string;
  /** @deprecated Użyj domainManageUrl — zachowane dla kompatybilności. */
  stagingHint: string;
  /** Login użytkownika DirectAdmin (konto hostingowe). */
  daUsername: string | null;
  /** Hasło konta DA zapisane przy provisioningu (null gdy brak konta / w trakcie). */
  daPassword: string | null;
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

/** GET /services/:id/hosting-domain-pointing — live weryfikacja A → IP węzła. */
export interface HostingDnsPointingDto {
  domain: string | null;
  expectedIpv4: string | null;
  serverName: string | null;
  observedA: string[];
  observedAaaa: string[];
  observedWwwA: string[];
  nameservers: string[];
  pointsToServer: boolean;
  wwwPointsToServer: boolean | null;
  status: 'ok' | 'partial' | 'fail' | 'pending';
  message: string;
  issues: string[];
  checkedAt: string;
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

export type HostingSslStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NONE';

export interface HostingSslRowDto {
  id: string;
  domain: string;
  /** Issuer organisation/CN parsed from the live certificate, or '—' when none. */
  issuer: string;
  status: HostingSslStatus;
  /** Certificate expiry (ISO) or null when there is no certificate. */
  expiresAt: string | null;
  isLetsEncrypt: boolean;
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
