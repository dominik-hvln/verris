-- PB-45 — jedna oczekująca prośba o zgodę na migrację na usługę. Sprawdzenie w aplikacji (count, potem create)
-- nie chroni przed dwoma równoległymi założeniami (dwóch operatorów, dwie karty) — drugie dostaje P2002,
-- a klient nie dostaje dwóch maili z dwoma linkami. Indeks częściowy: Prisma go nie opisuje (jak SslOrder_w_toku_key).
CREATE UNIQUE INDEX "MigrationRequest_oczekujaca_zgoda_key" ON "MigrationRequest"("subscriptionId")
  WHERE "status" = 'DRAFT' AND "consentDecidedAt" IS NULL AND "requestedByOperatorId" IS NOT NULL;
