-- Discoverable passkey login — challenge przed identyfikacją użytkownika (bez e-mail)
CREATE TABLE "WebAuthnLoginChallenge" (
    "id" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebAuthnLoginChallenge_challenge_key" ON "WebAuthnLoginChallenge"("challenge");

CREATE INDEX "WebAuthnLoginChallenge_expiresAt_idx" ON "WebAuthnLoginChallenge"("expiresAt");

ALTER TABLE "WebAuthnLoginChallenge" ADD CONSTRAINT "WebAuthnLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
