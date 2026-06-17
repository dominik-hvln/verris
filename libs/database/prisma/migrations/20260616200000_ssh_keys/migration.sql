-- SSH keys for VPS (key-based access instead of root password).

CREATE TABLE "SshKey" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "publicKey"    TEXT NOT NULL,
  "fingerprint"  TEXT NOT NULL,
  "hetznerKeyId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SshKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SshKey_userId_fingerprint_key" ON "SshKey"("userId", "fingerprint");
CREATE INDEX "SshKey_userId_idx" ON "SshKey"("userId");

ALTER TABLE "SshKey"
  ADD CONSTRAINT "SshKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
