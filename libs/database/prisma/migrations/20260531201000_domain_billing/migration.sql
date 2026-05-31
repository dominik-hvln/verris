-- Dedicated wallet transaction type for domain registration/renewal/transfer.
ALTER TYPE "WalletTxType" ADD VALUE IF NOT EXISTS 'CHARGE_DOMAIN';

-- Link a registrar order to the wallet transaction that paid for it (billing trail).
ALTER TABLE "DomainRegistrarOrder" ADD COLUMN "walletTxId" TEXT;
