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
  /** BILL-1 — rabat startowy z ustawień (dla porównania, reguła „nie łączymy"). */
  startPercent: number;
  /** Wyższy z: rabat kodu vs rabat startowy. */
  effectivePercent: number;
  /** Kwota do zapłaty po zastosowaniu korzystniejszej promocji. */
  effectiveDiscounted: string;
  /** true gdy kod jest co najmniej tak dobry jak promocja startowa. */
  codeWins: boolean;
  /** Komunikat dla klienta gdy kod jest gorszy/lepszy od promocji startowej. */
  comparisonMessage: string | null;
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
  /** SVC-TAG — unikalny handle usługi (np. „wnbgswgc”); dla hostingu = login DA. */
  serviceTag?: string | null;
  /** WALLET | STRIPE_CARD | MANUAL — do akcji „Opłać” / anuluj. */
  paymentSource?: 'WALLET' | 'STRIPE_CARD' | 'MANUAL';
  planSlug: string;
  planName: string;
  interval: BillingInterval;
  priceAmount: string;
  currency: string;
  currentPeriodEnd: string | null;
  ecoModeEnabled: boolean;
  autoscalingEnabled: boolean;
  /** O-1 — true while in a free trial; `trialEndsAt` is the window end. */
  isTrial: boolean;
  trialEndsAt: string | null;
  /** P-1b / EMM — product family of the underlying plan (drives panel UX). */
  productKind: 'HOSTING' | 'EMAIL' | 'EMAIL_MARKETING';
  account: ServiceAccountSummaryDto | null;
  /** Sprint 5 / R-11+B-7 — postęp provisioningu widoczny dla klienta. */
  provisioning: ProvisioningProgressDto | null;
  /** V-01 — service health score shown in client hosting UX. */
  health: ServiceHealthSummaryDto;
  /** V-05 — conservative plan/autoscaling recommendations. */
  recommendations: ServiceRecommendationDto[];
}

export type ServiceHealthCheckKey =
  | 'dnsOk'
  | 'tlsOk'
  | 'backupFresh'
  | 'lveOk'
  | 'panelTlsOk'
  | 'mailOk';

/** Rozwinięcie pojedynczego checku health score dla klienta. */
export interface ServiceHealthCheckDetailDto {
  status: 'ok' | 'warn' | 'unknown';
  label: string;
  explanation: string;
  whatToDo: string;
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
  /** Szczegóły per check — co jest nie tak i co zrobić (LIVE UX). */
  checkDetails?: Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>>;
}

export interface ServiceRecommendationDto {
  type: 'autoscaling' | 'plan' | 'domain' | 'backup';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
}

// -----------------------------------------------------------------------------
// ADM-2 — Centrum diagnostyki klienta (admin/staff). Jeden „Diagnozuj" składa
// sygnały (subskrypcja, konto, węzeł, DNS/SSL/poczta/backup/CPU, płatności) w
// listę ustaleń z sugerowaną akcją. Autorskie reguły, bez słowa „AI".
// -----------------------------------------------------------------------------
export type DiagnosticArea =
  | 'SUBSCRIPTION'
  | 'ACCOUNT'
  | 'NODE'
  | 'DNS'
  | 'SSL'
  | 'MAIL'
  | 'BACKUP'
  | 'PERFORMANCE'
  | 'BILLING';

export interface DiagnosticFindingDto {
  area: DiagnosticArea;
  status: 'ok' | 'warn' | 'critical';
  title: string;
  detail: string;
  /** Sugerowana akcja operatora (lub null, gdy brak / wszystko OK). */
  action: string | null;
}

export interface ServiceDiagnosticsDto {
  subscriptionId: string;
  generatedAt: string;
  overall: 'ok' | 'attention' | 'critical';
  summary: string;
  findings: DiagnosticFindingDto[];
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
  /** Główna domena konta — synchronizowana z DirectAdmin przy odczycie. */
  primaryDomain: string | null;
  fetchError: string | null;
}

/** GET /services/:id/hosting-databases — bazy MySQL z CMD_API_DATABASES. */
export interface HostingMysqlDatabasesResponseDto {
  databases: { name: string }[];
  daUsername: string | null;
  /** DB-1 — realny silnik+wersja bazy odczytany z węzła (null, gdy nieosiągalny). */
  engine: { name: string; version: string } | null;
  fetchError: string | null;
}

/** GET /services/:id/hosting-da-links — adresy absolutne do stron DA (Evolution skin). */
export interface HostingDaLinksResponseDto {
  panelBaseUrl: string;
  /** Hostname do wyświetlenia (np. node-pl-01.verris.pl) — bez portu. */
  panelDisplayHost: string;
  databasesUrl: string;
  /** Skrzynki e-mail w panelu Evolution. */
  emailUrl: string;
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
  expectedNameservers: string[];
  observedA: string[];
  observedAaaa: string[];
  observedWwwA: string[];
  nameservers: string[];
  delegatedToExpectedNs: boolean;
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
  /** Dni do wygaśnięcia (ujemne = wygasł), null gdy brak certu. */
  daysLeft: number | null;
  /** Nazwy pokrywane przez certyfikat (SAN) — pokazuje np. wildcard *.domena. */
  coveredNames: string[];
  /** Czy certyfikat pokrywa wildcard (*.domena). */
  isWildcard: boolean;
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

// -----------------------------------------------------------------------------
// Staging — subdomena + opcjonalna baza klona (CMD_API_SUBDOMAINS / CMD_API_DATABASES)
// -----------------------------------------------------------------------------

export interface HostingStagingEnvDto {
  /** `subdomena.domena` — identyfikator środowiska. */
  id: string;
  subdomain: string;
  domain: string;
  /** Pełny adres staging, np. https://staging.example.com */
  url: string;
}

/** GET /services/:id/hosting-staging */
export interface HostingStagingResponseDto {
  rows: HostingStagingEnvDto[];
  /** Domeny konta, pod którymi można utworzyć staging. */
  domains: string[];
  primaryDomain: string | null;
  fetchError: string | null;
}

/** POST /services/:id/hosting-staging */
export interface HostingStagingCreateRequestDto {
  domain: string;
  /** Etykieta poddomeny (a-z0-9-), domyślnie „staging". */
  label?: string;
  /** Gdy true, tworzymy też dedykowaną bazę MySQL dla środowiska staging. */
  withDatabase?: boolean;
}

/** Dane bazy staging — pokazywane tylko raz, zaraz po utworzeniu. */
export interface HostingStagingDatabaseDto {
  name: string;
  user: string;
  password: string;
}

export interface HostingStagingCreatedDto {
  ok: true;
  env: HostingStagingEnvDto;
  database: HostingStagingDatabaseDto | null;
}

export type HostingStagingMutationOkDto = { ok: true };

// -----------------------------------------------------------------------------
// Deploy — automatyczne wdrożenia Git oparte o harmonogram (cron DirectAdmin)
// -----------------------------------------------------------------------------
//
// DirectAdmin (user API) nie udostępnia wykonywania komend „na żądanie", więc
// realne, w pełni działające wdrożenia budujemy na cronie konta: harmonogram
// wykonuje `git pull` + build w docroot. To standardowy mechanizm auto-deploy
// na hostingu współdzielonym (bez pozornego przycisku „push").

export type DeployFrequency = 'every_15m' | 'hourly' | 'daily';

export interface DeployJobDto {
  /** Indeks zadania cron w DirectAdmin. */
  id: string;
  /** Domena, której docroot dotyczy wdrożenie. */
  domain: string;
  /** Pełna komenda wdrożenia uruchamiana przez cron. */
  command: string;
  branch: string | null;
  frequency: DeployFrequency;
  /** Surowy harmonogram cron (5 pól) — informacyjnie. */
  schedule: string;
}

/** GET /services/:id/deploy-jobs */
export interface DeployJobsResponseDto {
  rows: DeployJobDto[];
  /** Domeny konta dostępne do skonfigurowania wdrożeń. */
  domains: string[];
  primaryDomain: string | null;
  fetchError: string | null;
}

/** POST /services/:id/deploy-jobs */
export interface DeployJobCreateRequestDto {
  domain: string;
  /** Gałąź Git do wdrożenia (domyślnie bieżąca). */
  branch?: string;
  /** Dodatkowa komenda build po `git pull` (np. `composer install --no-dev`). */
  buildCommand?: string;
  frequency: DeployFrequency;
}

export type DeployJobMutationOkDto = { ok: true };
