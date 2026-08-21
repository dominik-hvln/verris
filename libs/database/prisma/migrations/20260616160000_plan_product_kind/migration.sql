-- P-1b — standalone billable e-mail product.
-- A Plan now declares its product family. EMAIL plans reuse the same DA-account
-- provisioning/checkout/billing as HOSTING, but the panel presents them as a
-- mail product (mailbox manager + webmail, web tools hidden).

CREATE TYPE "ProductKind" AS ENUM ('HOSTING', 'EMAIL');

ALTER TABLE "Plan"
  ADD COLUMN "productKind" "ProductKind" NOT NULL DEFAULT 'HOSTING';
