-- F2.5 (11.10) — helpdesk: notatki wewnętrzne w wątku, tagi zgłoszeń, zgłoszenie założone przez obsługę
-- w imieniu klienta. Same kolumny z wartościami domyślnymi — stary kod (przed podmianą) ich nie zna i działa dalej.

ALTER TABLE "TicketReply" ADD COLUMN IF NOT EXISTS "internal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "openedByStaffId" TEXT;
