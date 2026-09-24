-- PB-26 — zaproszenia do testów przed startem (imienny kod promocyjny na testera).
CREATE TABLE "BetaInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "promoCodeId" TEXT NOT NULL,
    "invitedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BetaInvite_promoCodeId_key" ON "BetaInvite"("promoCodeId");
CREATE INDEX "BetaInvite_email_idx" ON "BetaInvite"("email");

ALTER TABLE "BetaInvite" ADD CONSTRAINT "BetaInvite_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
