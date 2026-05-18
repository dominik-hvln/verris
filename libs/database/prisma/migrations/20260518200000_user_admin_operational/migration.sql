-- Sprint 4 / R-04 — operacyjne zarządzanie kontem klienta (admin)
ALTER TABLE "User" ADD COLUMN "loginBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "loginBlockedReason" TEXT;
ALTER TABLE "User" ADD COLUMN "adminInternalNote" TEXT;
