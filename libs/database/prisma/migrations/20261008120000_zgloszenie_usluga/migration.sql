-- PB-43 — zgłoszenie powiązane z usługą (decyzja właściciela 08.10: rdzeń przed betą).
-- Usunięcie usługi nie kasuje zgłoszenia — powiązanie znika (SET NULL), rozmowa zostaje.
ALTER TABLE "Ticket" ADD COLUMN "subscriptionId" TEXT;

CREATE INDEX "Ticket_subscriptionId_idx" ON "Ticket"("subscriptionId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
