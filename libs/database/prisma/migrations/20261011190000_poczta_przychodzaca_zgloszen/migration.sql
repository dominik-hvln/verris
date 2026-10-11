-- F3.7 (OE-19, D6, 11.10) — poczta przychodząca do zgłoszeń (IMAP skrzynek zespołu) i blokady nadawców.
-- Addytywna i idempotentna (nowe tabele); stary kod ich nie czyta, więc migracja może wejść przed podmianą kodu.

CREATE TABLE IF NOT EXISTS "PocztaPrzychodzaca" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "skrzynka" TEXT NOT NULL,
    "uid" INTEGER,
    "nadawca" TEXT NOT NULL,
    "nadawcaNazwa" TEXT,
    "temat" TEXT NOT NULL,
    "doAdresy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rodzaj" TEXT NOT NULL DEFAULT 'SUPPORT',
    "otrzymano" TIMESTAMP(3) NOT NULL,
    "rozmiar" INTEGER NOT NULL,
    "wynik" TEXT NOT NULL,
    "powod" TEXT,
    "tresc" TEXT,
    "zalaczniki" JSONB NOT NULL DEFAULT '[]',
    "ticketId" TEXT,
    "replyId" TEXT,
    "userId" TEXT,
    "sugerowaneZgloszenieId" TEXT,
    "obsluzylId" TEXT,
    "obsluzono" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PocztaPrzychodzaca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PocztaPrzychodzaca_messageId_key" ON "PocztaPrzychodzaca"("messageId");
CREATE INDEX IF NOT EXISTS "PocztaPrzychodzaca_wynik_createdAt_idx" ON "PocztaPrzychodzaca"("wynik", "createdAt");
CREATE INDEX IF NOT EXISTS "PocztaPrzychodzaca_ticketId_idx" ON "PocztaPrzychodzaca"("ticketId");
CREATE INDEX IF NOT EXISTS "PocztaPrzychodzaca_userId_idx" ON "PocztaPrzychodzaca"("userId");

DO $$ BEGIN
  ALTER TABLE "PocztaPrzychodzaca" ADD CONSTRAINT "PocztaPrzychodzaca_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PocztaBlokadaNadawcy" (
    "wzorzec" TEXT NOT NULL,
    "powod" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PocztaBlokadaNadawcy_pkey" PRIMARY KEY ("wzorzec")
);
