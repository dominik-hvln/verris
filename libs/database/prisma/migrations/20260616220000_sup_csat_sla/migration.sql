-- SUP-4 (CSAT) + SUP-5 (support SLA per plan).

ALTER TABLE "Plan"
  ADD COLUMN "supportSlaHours" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Ticket"
  ADD COLUMN "csatRating"  INTEGER,
  ADD COLUMN "csatComment" TEXT,
  ADD COLUMN "csatAt"      TIMESTAMP(3);
