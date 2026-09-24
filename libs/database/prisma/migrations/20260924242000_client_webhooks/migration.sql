-- L-10 — webhooki klienta (zdarzenia konta wysyłane na adres klienta, podpis HMAC).
CREATE TABLE "ClientWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientWebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientWebhookEndpoint_userId_idx" ON "ClientWebhookEndpoint"("userId");
CREATE INDEX "ClientWebhookDelivery_status_nextAttemptAt_idx" ON "ClientWebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "ClientWebhookDelivery_endpointId_createdAt_idx" ON "ClientWebhookDelivery"("endpointId", "createdAt");

ALTER TABLE "ClientWebhookEndpoint" ADD CONSTRAINT "ClientWebhookEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientWebhookDelivery" ADD CONSTRAINT "ClientWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ClientWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
