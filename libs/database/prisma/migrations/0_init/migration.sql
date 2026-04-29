-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('INIT', 'PENDING_APPROVAL', 'ACTIVE', 'MAINTENANCE', 'OFFLINE', 'DEPROVISIONING');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'PROVISIONING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentSource" AS ENUM ('STRIPE_CARD', 'WALLET', 'MANUAL');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOPUP', 'REFUND', 'CHARGE_SUBSCRIPTION', 'CHARGE_AUTOSCALING', 'CHARGE_USAGE', 'ADJUSTMENT', 'PROMO_CREDIT');

-- CreateEnum
CREATE TYPE "WalletTxStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "AutoscalingResource" AS ENUM ('CPU', 'RAM', 'IO', 'TRANSFER');

-- CreateEnum
CREATE TYPE "AutoscalingDirection" AS ENUM ('UP', 'DOWN', 'DISABLED', 'ENABLED');

-- CreateEnum
CREATE TYPE "ProbeKind" AS ENUM ('HTTP', 'HTTPS', 'SMTP', 'IMAP', 'POP3', 'MYSQL', 'SSH', 'DA_API', 'DNS');

-- CreateEnum
CREATE TYPE "ProbeSeverity" AS ENUM ('MINOR', 'MAJOR');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('MINOR', 'MAJOR');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "nip" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'PL',
    "locale" TEXT NOT NULL DEFAULT 'pl',
    "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "walletCurrency" TEXT NOT NULL DEFAULT 'PLN',
    "ecoPoints" INTEGER NOT NULL DEFAULT 0,
    "twoFactorSecret" TEXT,
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnrolledAt" TIMESTAMP(3),
    "twoFactorRecoveryCodesEnc" TEXT,
    "stripeCustomerId" TEXT,
    "defaultPaymentMethodId" TEXT,
    "canAccessGrafana" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "hostname" TEXT,
    "ipAddress" TEXT NOT NULL,
    "region" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'INIT',
    "totalCpuCores" INTEGER,
    "totalMemoryMb" INTEGER,
    "totalDiskMb" INTEGER,
    "allocatedCpu" INTEGER NOT NULL DEFAULT 0,
    "allocatedMemory" INTEGER NOT NULL DEFAULT 0,
    "allocatedDisk" INTEGER NOT NULL DEFAULT 0,
    "identityToken" TEXT,
    "publicKey" TEXT,
    "agentVersion" TEXT,
    "lastHandshakeAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "daHost" TEXT,
    "daPort" INTEGER,
    "daUsername" TEXT,
    "daPasswordEnc" TEXT,
    "daUseTls" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BootstrapToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedFromIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BootstrapToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cpuLimit" INTEGER NOT NULL,
    "ramLimitMb" INTEGER NOT NULL,
    "diskLimitMb" INTEGER NOT NULL,
    "ioLimitKbps" INTEGER NOT NULL DEFAULT 10240,
    "iopsLimit" INTEGER NOT NULL DEFAULT 1024,
    "entryProcesses" INTEGER NOT NULL DEFAULT 40,
    "workers" INTEGER NOT NULL DEFAULT 20,
    "includedTransferGb" INTEGER,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "priceYearly" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "stripeProductId" TEXT,
    "stripePriceMonthlyId" TEXT,
    "stripePriceYearlyId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "interval" "BillingInterval" NOT NULL,
    "priceAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "paymentSource" "SubscriptionPaymentSource" NOT NULL DEFAULT 'STRIPE_CARD',
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "autoscalingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoscalingMaxCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "autoscalingDisabledReason" TEXT,
    "ecoModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "daUsername" TEXT NOT NULL,
    "daPasswordEnc" TEXT,
    "domain" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PROVISIONING',
    "cpuLimit" INTEGER NOT NULL DEFAULT 100,
    "ramLimitMb" INTEGER NOT NULL DEFAULT 1024,
    "diskLimitMb" INTEGER NOT NULL DEFAULT 5120,
    "ioLimitKbps" INTEGER NOT NULL DEFAULT 10240,
    "iopsLimit" INTEGER NOT NULL DEFAULT 1024,
    "entryProcesses" INTEGER NOT NULL DEFAULT 40,
    "workers" INTEGER NOT NULL DEFAULT 20,
    "scaledCpu" INTEGER NOT NULL DEFAULT 0,
    "scaledRamMb" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "status" "WalletTxStatus" NOT NULL DEFAULT 'COMPLETED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" TEXT,
    "paymentProvider" TEXT,
    "paymentRef" TEXT,
    "subscriptionId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "provider" TEXT,
    "providerRef" TEXT,
    "hostedUrl" TEXT,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscalingPriceRule" (
    "id" TEXT NOT NULL,
    "resource" "AutoscalingResource" NOT NULL,
    "unit" TEXT NOT NULL,
    "pricePerUnit" DECIMAL(12,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "thresholdAbove" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscalingPriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscalingEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "direction" "AutoscalingDirection" NOT NULL,
    "resource" "AutoscalingResource",
    "fromValue" INTEGER,
    "toValue" INTEGER,
    "reason" TEXT NOT NULL,
    "costSnapshot" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscalingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageMetric" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "accountId" TEXT,
    "serverId" TEXT,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "bucketDurationS" INTEGER NOT NULL,
    "cpuUsageAvg" DOUBLE PRECISION NOT NULL,
    "cpuUsageMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memUsageAvgMb" DOUBLE PRECISION NOT NULL,
    "memUsageMaxMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diskUsageMb" DOUBLE PRECISION NOT NULL,
    "ioUsageKbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "department" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "userId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "actorUserId" TEXT,
    "impersonatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProbe" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "kind" "ProbeKind" NOT NULL,
    "target" TEXT NOT NULL,
    "label" TEXT,
    "severity" "ProbeSeverity" NOT NULL DEFAULT 'MINOR',
    "declaredSlaPct" DECIMAL(7,4) NOT NULL DEFAULT 99.9000,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastSampleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProbe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbeSample" (
    "id" TEXT NOT NULL,
    "probeId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "bucketDurationS" INTEGER NOT NULL DEFAULT 60,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "maxLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbeSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbeIncident" (
    "id" TEXT NOT NULL,
    "probeId" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "publicMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "detectionMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProbeIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_ipAddress_key" ON "Server"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Server_identityToken_key" ON "Server"("identityToken");

-- CreateIndex
CREATE INDEX "Server_status_idx" ON "Server"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BootstrapToken_tokenHash_key" ON "BootstrapToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BootstrapToken_serverId_idx" ON "BootstrapToken"("serverId");

-- CreateIndex
CREATE INDEX "BootstrapToken_expiresAt_idx" ON "BootstrapToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripePriceMonthlyId_key" ON "Plan"("stripePriceMonthlyId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripePriceYearlyId_key" ON "Plan"("stripePriceYearlyId");

-- CreateIndex
CREATE INDEX "Plan_isPublic_isActive_idx" ON "Plan"("isPublic", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_idx" ON "SubscriptionEvent"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_daUsername_key" ON "Account"("daUsername");

-- CreateIndex
CREATE UNIQUE INDEX "Account_domain_key" ON "Account"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Account_subscriptionId_key" ON "Account"("subscriptionId");

-- CreateIndex
CREATE INDEX "Account_serverId_idx" ON "Account"("serverId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_provider_providerRef_key" ON "PaymentMethod"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_provider_providerRef_key" ON "Invoice"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "AutoscalingPriceRule_resource_isActive_idx" ON "AutoscalingPriceRule"("resource", "isActive");

-- CreateIndex
CREATE INDEX "AutoscalingEvent_subscriptionId_createdAt_idx" ON "AutoscalingEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageMetric_accountId_bucketStart_idx" ON "UsageMetric"("accountId", "bucketStart");

-- CreateIndex
CREATE INDEX "UsageMetric_serverId_bucketStart_idx" ON "UsageMetric"("serverId", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "UsageMetric_subscriptionId_bucketStart_bucketDurationS_key" ON "UsageMetric"("subscriptionId", "bucketStart", "bucketDurationS");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceProbe_serverId_kind_idx" ON "ServiceProbe"("serverId", "kind");

-- CreateIndex
CREATE INDEX "ServiceProbe_isEnabled_lastSampleAt_idx" ON "ServiceProbe"("isEnabled", "lastSampleAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProbe_serverId_kind_target_key" ON "ServiceProbe"("serverId", "kind", "target");

-- CreateIndex
CREATE INDEX "ProbeSample_probeId_bucketStart_idx" ON "ProbeSample"("probeId", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProbeSample_probeId_bucketStart_bucketDurationS_key" ON "ProbeSample"("probeId", "bucketStart", "bucketDurationS");

-- CreateIndex
CREATE INDEX "ProbeIncident_probeId_status_idx" ON "ProbeIncident"("probeId", "status");

-- CreateIndex
CREATE INDEX "ProbeIncident_status_startedAt_idx" ON "ProbeIncident"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BootstrapToken" ADD CONSTRAINT "BootstrapToken_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BootstrapToken" ADD CONSTRAINT "BootstrapToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscalingEvent" ADD CONSTRAINT "AutoscalingEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageMetric" ADD CONSTRAINT "UsageMetric_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProbe" ADD CONSTRAINT "ServiceProbe_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbeSample" ADD CONSTRAINT "ProbeSample_probeId_fkey" FOREIGN KEY ("probeId") REFERENCES "ServiceProbe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbeIncident" ADD CONSTRAINT "ProbeIncident_probeId_fkey" FOREIGN KEY ("probeId") REFERENCES "ServiceProbe"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =========================================================================
-- F-16: Read-only role + safe views for Grafana data-source. The role is the
-- ONLY connection method Grafana ever uses; views hide every secret-bearing
-- column (passwordHash, twoFactorSecret, twoFactorRecoveryCodesEnc,
-- daPasswordEnc, identityToken, tokenHash) so a misconfigured panel can't
-- accidentally exfiltrate them.
-- The role's password MUST be rotated immediately after first deploy:
--     ALTER USER grafana_ro PASSWORD '<from-vault>';
-- =========================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
        CREATE ROLE grafana_ro LOGIN PASSWORD 'CHANGE_ME_VIA_ALTER_USER';
    END IF;
END
$$;

CREATE OR REPLACE VIEW public.user_safe AS
SELECT
    "id", "email", "role", "firstName", "lastName", "companyName",
    "country", "locale", "walletBalance", "walletCurrency",
    "ecoPoints", "isTwoFactorEnabled", "canAccessGrafana",
    "createdAt", "updatedAt"
FROM public."User";

CREATE OR REPLACE VIEW public.server_safe AS
SELECT
    "id", "name", "region", "status", "lastHeartbeatAt",
    "approvedAt", "createdAt", "updatedAt"
FROM public."Server";

CREATE OR REPLACE VIEW public.account_safe AS
SELECT
    "id", "daUsername", "domain", "status",
    "cpuLimit", "ramLimitMb", "diskLimitMb", "ioLimitKbps", "iopsLimit",
    "scaledCpu", "scaledRamMb",
    "userId", "serverId", "subscriptionId",
    "createdAt", "updatedAt"
FROM public."Account";

CREATE OR REPLACE VIEW public.subscription_safe AS
SELECT
    "id", "userId", "planId", "status", "interval", "paymentSource",
    "currentPeriodStart", "currentPeriodEnd",
    "autoscalingEnabled", "autoscalingMaxCost",
    "createdAt", "updatedAt"
FROM public."Subscription";

CREATE OR REPLACE VIEW public.wallet_transaction_safe AS
SELECT
    "id", "userId", "type", "status", "amount", "currency", "balanceAfter",
    "subscriptionId", "description", "idempotencyKey", "createdAt"
FROM public."WalletTransaction";

CREATE OR REPLACE VIEW public.invoice_safe AS
SELECT
    "id", "userId", "subscriptionId", "number", "status",
    "provider", "providerRef", "amount", "currency",
    "issuedAt", "dueAt", "paidAt",
    "createdAt", "updatedAt"
FROM public."Invoice";

CREATE OR REPLACE VIEW public.usage_metric_safe          AS SELECT * FROM public."UsageMetric";
CREATE OR REPLACE VIEW public.autoscaling_event_safe     AS SELECT * FROM public."AutoscalingEvent";
CREATE OR REPLACE VIEW public.probe_sample_safe          AS SELECT * FROM public."ProbeSample";
CREATE OR REPLACE VIEW public.probe_incident_safe        AS SELECT * FROM public."ProbeIncident";

GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT ON
    public.user_safe,
    public.server_safe,
    public.account_safe,
    public.subscription_safe,
    public.wallet_transaction_safe,
    public.invoice_safe,
    public.usage_metric_safe,
    public.autoscaling_event_safe,
    public.probe_sample_safe,
    public.probe_incident_safe
TO grafana_ro;
