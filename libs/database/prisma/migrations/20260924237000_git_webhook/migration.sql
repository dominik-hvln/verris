-- C-27 — webhook wdrożenia z Gita (tajny adres → git pull w katalogu strony).
CREATE TABLE "GitWebhook" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dir" TEXT NOT NULL DEFAULT '',
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitWebhook_tokenHash_key" ON "GitWebhook"("tokenHash");
CREATE UNIQUE INDEX "GitWebhook_accountId_domain_dir_key" ON "GitWebhook"("accountId", "domain", "dir");

ALTER TABLE "GitWebhook" ADD CONSTRAINT "GitWebhook_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
