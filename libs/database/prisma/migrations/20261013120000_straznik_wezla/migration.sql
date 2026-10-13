-- 13.10 — strażnik węzła: zdarzenia (wykrycie, diagnoza, kroki naprawy, wynik) raportowane przez verris-straznik.sh.
-- Nowa tabela, addytywna i idempotentna; stary kod jej nie używa.

CREATE TABLE IF NOT EXISTS "ZdarzenieStraznika" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "wezelId" TEXT NOT NULL,
  "rodzaj" TEXT NOT NULL,
  "stan" TEXT NOT NULL,
  "objaw" TEXT NOT NULL,
  "kroki" JSONB NOT NULL,
  "diagnoza" TEXT NOT NULL,
  "katalog" TEXT,
  "wykrytoAt" TIMESTAMP(3) NOT NULL,
  "zakonczonoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZdarzenieStraznika_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZdarzenieStraznika_stan_check" CHECK ("stan" IN ('naprawa', 'naprawiono', 'nie_naprawiono', 'restart', 'tylko_alarm'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ZdarzenieStraznika_serverId_wezelId_key" ON "ZdarzenieStraznika"("serverId", "wezelId");
CREATE INDEX IF NOT EXISTS "ZdarzenieStraznika_serverId_createdAt_idx" ON "ZdarzenieStraznika"("serverId", "createdAt");
CREATE INDEX IF NOT EXISTS "ZdarzenieStraznika_stan_createdAt_idx" ON "ZdarzenieStraznika"("stan", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ZdarzenieStraznika" ADD CONSTRAINT "ZdarzenieStraznika_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
