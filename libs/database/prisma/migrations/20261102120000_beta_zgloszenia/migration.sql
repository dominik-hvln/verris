-- 2.11 — otwarta beta: zgłoszenia z formularza verris.pl/beta (double opt-in, decyzja w panelu admina).
-- Tylko nowe obiekty — „migrate deploy, potem kod” bezpieczne.
DO $$ BEGIN
  CREATE TYPE "BetaZgloszenieStatus" AS ENUM ('NIEPOTWIERDZONE', 'NOWE', 'ZAPROSZONE', 'ODRZUCONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BetaZgloszenie" (
    "id" TEXT NOT NULL,
    "imie" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "zakres" TEXT[],
    "strona" TEXT,
    "obecnyHosting" TEXT,
    "uwagi" TEXT,
    "utm" JSONB,
    "page" TEXT,
    "zgodaTekst" TEXT NOT NULL,
    "zgodaAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "status" "BetaZgloszenieStatus" NOT NULL DEFAULT 'NIEPOTWIERDZONE',
    "confirmToken" TEXT,
    "potwierdzoneAt" TIMESTAMP(3),
    "mailAt" TIMESTAMP(3),
    "betaInviteId" TEXT,
    "decyzjaAt" TIMESTAMP(3),
    "decyzjaPrzezId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BetaZgloszenie_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BetaZgloszenie_confirmToken_key" ON "BetaZgloszenie"("confirmToken");
CREATE INDEX IF NOT EXISTS "BetaZgloszenie_status_createdAt_idx" ON "BetaZgloszenie"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "BetaZgloszenie_email_idx" ON "BetaZgloszenie"("email");

DO $$ BEGIN
  ALTER TABLE "BetaZgloszenie" ADD CONSTRAINT "BetaZgloszenie_betaInviteId_fkey" FOREIGN KEY ("betaInviteId") REFERENCES "BetaInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
