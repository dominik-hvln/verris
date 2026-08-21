-- SVC-TAG — unikalny handle usługi (widoczny obok pakietu, dla hostingu = login DA).
ALTER TABLE "Subscription" ADD COLUMN "serviceTag" TEXT;

-- Backfill istniejących usług: handle = obecny login DirectAdmin konta (to już
-- realny prefiks baz danych), więc handle pozostaje spójny z tym, co na węźle.
UPDATE "Subscription" s
SET "serviceTag" = a."daUsername"
FROM "Account" a
WHERE a."subscriptionId" = s."id"
  AND a."daUsername" IS NOT NULL
  AND s."serviceTag" IS NULL;

-- Unikalność handle (po backfillu, aby nie wywrócić się na duplikatach).
CREATE UNIQUE INDEX "Subscription_serviceTag_key" ON "Subscription" ("serviceTag");
