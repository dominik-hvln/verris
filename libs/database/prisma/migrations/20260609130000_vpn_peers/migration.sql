-- ETAP 8: WireGuard VPN peers (panele admin/staff za VPN).
CREATE TABLE "VpnPeer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "publicKey" TEXT NOT NULL,
    "presharedKeyEnc" TEXT,
    "assignedIp" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpnPeer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VpnPeer_publicKey_key" ON "VpnPeer"("publicKey");
CREATE UNIQUE INDEX "VpnPeer_assignedIp_key" ON "VpnPeer"("assignedIp");
CREATE INDEX "VpnPeer_enabled_idx" ON "VpnPeer"("enabled");
