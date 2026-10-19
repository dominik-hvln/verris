-- PB-26 (19.10) — postęp testera na stronie „Testy (beta)” w panelu klienta: odhaczone kroki i uwagi.
-- Addytywna i idempotentna (nowa tabela); stary kod jej nie czyta, więc „migrate deploy, potem kod” jest bezpieczne.

CREATE TABLE IF NOT EXISTS "BetaPostep" (
    "userId" TEXT NOT NULL,
    "kroki" JSONB NOT NULL DEFAULT '{}',
    "uwagi" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BetaPostep_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "BetaPostep_kroki_check" CHECK (jsonb_typeof("kroki") = 'object'),
    CONSTRAINT "BetaPostep_uwagi_check" CHECK (jsonb_typeof("uwagi") = 'object')
);

CREATE INDEX IF NOT EXISTS "BetaPostep_updatedAt_idx" ON "BetaPostep"("updatedAt");

DO $$ BEGIN
  ALTER TABLE "BetaPostep" ADD CONSTRAINT "BetaPostep_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
