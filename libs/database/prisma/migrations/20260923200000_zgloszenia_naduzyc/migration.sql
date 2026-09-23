-- N-13 — zgłoszenia nadużyć (DSA art. 16/17).
CREATE TYPE "AbuseReportStatus" AS ENUM ('NEW', 'IN_REVIEW', 'ACTION_TAKEN', 'REJECTED');
CREATE TYPE "AbuseCategory" AS ENUM ('SPAM', 'PHISHING', 'MALWARE', 'ILLEGAL_CONTENT', 'COPYRIGHT', 'PERSONAL_DATA', 'OTHER');

CREATE TABLE "AbuseReport" (
    "id" TEXT NOT NULL,
    "status" "AbuseReportStatus" NOT NULL DEFAULT 'NEW',
    "category" "AbuseCategory" NOT NULL,
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reporterName" TEXT,
    "reporterEmail" TEXT NOT NULL,
    "goodFaith" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "subscriptionId" TEXT,
    "userId" TEXT,
    "assignedToId" TEXT,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "customerNotifiedAt" TIMESTAMP(3),
    "reporterNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AbuseReport_status_createdAt_idx" ON "AbuseReport"("status", "createdAt");
CREATE INDEX "AbuseReport_host_idx" ON "AbuseReport"("host");
