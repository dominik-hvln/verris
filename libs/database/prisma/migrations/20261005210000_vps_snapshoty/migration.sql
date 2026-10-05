-- Q-08 — snapshoty VPS-a (rozliczane z portfela przy odnowieniu VPS-a).
CREATE TABLE "VpsSnapshot" (
  "id"             TEXT NOT NULL,
  "vpsInstanceId"  TEXT NOT NULL,
  "hetznerImageId" TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "sizeGb"         DECIMAL(10,2),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "VpsSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VpsSnapshot_hetznerImageId_key" ON "VpsSnapshot"("hetznerImageId");
CREATE INDEX "VpsSnapshot_vpsInstanceId_deletedAt_idx" ON "VpsSnapshot"("vpsInstanceId", "deletedAt");

ALTER TABLE "VpsSnapshot"
  ADD CONSTRAINT "VpsSnapshot_vpsInstanceId_fkey" FOREIGN KEY ("vpsInstanceId") REFERENCES "VpsInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
