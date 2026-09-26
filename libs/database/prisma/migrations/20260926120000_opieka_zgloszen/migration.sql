-- PB-37 — opieka nad zgłoszeniem: auto-wiadomości, „przeczytane”, oceny opiekuna, szkic asystenta, kategorie szablonów
ALTER TABLE "Ticket" ADD COLUMN "staffReadAt" TIMESTAMP(3),
  ADD COLUMN "progressNoticeAt" TIMESTAMP(3),
  ADD COLUMN "agentRating" INTEGER,
  ADD COLUMN "csatResolved" BOOLEAN,
  ADD COLUMN "csatAgentId" TEXT,
  ADD COLUMN "aiDraft" TEXT,
  ADD COLUMN "aiDraftAt" TIMESTAMP(3);
ALTER TABLE "TicketReply" ADD COLUMN "automatic" TEXT;
ALTER TABLE "CannedResponse" ADD COLUMN "category" TEXT;
CREATE INDEX "Ticket_csatAgentId_csatAt_idx" ON "Ticket"("csatAgentId", "csatAt");
