-- SUP-V2 — przebudowa supportu: obsługa braku odpowiedzi klienta, auto-zamykanie,
-- historia zdarzeń ticketu i szybkie kody szablonów.
-- Wzorzec expand: nowe kolumny są NULLABLE, istniejące rekordy pozostają nietknięte.

-- 1) Pola operacyjne na Ticket (śledzenie odpowiedzi + cykl przypomnień/auto-zamykania).
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastReplyAt"                TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastReplyIsStaff"           BOOLEAN;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "waitingSince"               TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "customerReminderSentAt"     TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "slaResponseBreachAlertedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "autoClosedAt"               TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Ticket_status_waitingSince_idx" ON "Ticket" ("status", "waitingSince");

-- 2) Szybki kod szablonu odpowiedzi (opcjonalny).
ALTER TABLE "CannedResponse" ADD COLUMN IF NOT EXISTS "shortcut" TEXT;

-- 3) Historia zdarzeń ticketu (append-only, źródło osi czasu i idempotencji schedulera).
CREATE TABLE IF NOT EXISTS "TicketEvent" (
    "id"        TEXT NOT NULL,
    "ticketId"  TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "actorId"   TEXT,
    "meta"      JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent" ("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "TicketEvent_ticketId_type_idx"      ON "TicketEvent" ("ticketId", "type");

DO $$ BEGIN
    ALTER TABLE "TicketEvent"
        ADD CONSTRAINT "TicketEvent_ticketId_fkey"
        FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
