-- Paczka 109 / W2 — pieniądze i konta.

-- A1-01 — zmiana danych potwierdzonego zgłoszenia do bety czeka na nowe potwierdzenie.
ALTER TABLE "BetaZgloszenie" ADD COLUMN "zmiana" JSONB;
ALTER TABLE "BetaZgloszenie" ADD COLUMN "zmianaToken" TEXT;
CREATE UNIQUE INDEX "BetaZgloszenie_zmianaToken_key" ON "BetaZgloszenie"("zmianaToken");

-- P2-11 — przypomnienie zaproszenia po ponownym zgłoszeniu (najwyżej raz na dobę).
ALTER TABLE "BetaInvite" ADD COLUMN "przypomnienieAt" TIMESTAMP(3);

-- A2-07 / decyzja 9 — wniosek o zwrot opłaconych kredytów przy usunięciu konta.
CREATE TYPE "WniosekZwrotuSaldaStatus" AS ENUM ('NOWY', 'ZREALIZOWANY', 'ODRZUCONY');

CREATE TABLE "WniosekZwrotuSalda" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kwota" DECIMAL(12,2) NOT NULL,
    "saldoPrzy" DECIMAL(12,2) NOT NULL,
    "numerRachunku" TEXT NOT NULL,
    "odbiorca" TEXT NOT NULL,
    "status" "WniosekZwrotuSaldaStatus" NOT NULL DEFAULT 'NOWY',
    "ticketId" TEXT,
    "terminDo" TIMESTAMP(3) NOT NULL,
    "zrealizowanoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WniosekZwrotuSalda_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WniosekZwrotuSalda_userId_idx" ON "WniosekZwrotuSalda"("userId");
CREATE INDEX "WniosekZwrotuSalda_status_terminDo_idx" ON "WniosekZwrotuSalda"("status", "terminDo");
