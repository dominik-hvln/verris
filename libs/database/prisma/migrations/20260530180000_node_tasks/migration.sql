-- Node tasks — remote operator jobs executed by compute-node agent (hosting profile, etc.)

CREATE TYPE "NodeTaskKind" AS ENUM ('HOSTING_PROFILE');

CREATE TYPE "NodeTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "NodeTask" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "kind" "NodeTaskKind" NOT NULL,
    "status" "NodeTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "outputLog" TEXT,
    "errorMessage" TEXT,
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NodeTask_serverId_status_idx" ON "NodeTask"("serverId", "status");
CREATE INDEX "NodeTask_createdAt_idx" ON "NodeTask"("createdAt");

ALTER TABLE "NodeTask" ADD CONSTRAINT "NodeTask_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NodeTask" ADD CONSTRAINT "NodeTask_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
