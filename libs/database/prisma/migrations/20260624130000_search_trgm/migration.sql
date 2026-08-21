-- PERF-2 — indeksy trigramowe (pg_trgm) pod globalną wyszukiwarkę (ADM-4),
-- która używa ILIKE '%q%' po e-mailu/nazwie/NIP/domenie/handle/fakturze.
-- GIN trgm sprawia, że wyszukiwanie skaluje się przy rosnącej bazie.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "User_email_trgm_idx" ON "User" USING gin ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_companyName_trgm_idx" ON "User" USING gin ("companyName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_nip_trgm_idx" ON "User" USING gin ("nip" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_lastName_trgm_idx" ON "User" USING gin ("lastName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Account_domain_trgm_idx" ON "Account" USING gin ("domain" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Account_daUsername_trgm_idx" ON "Account" USING gin ("daUsername" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Subscription_serviceTag_trgm_idx" ON "Subscription" USING gin ("serviceTag" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Invoice_number_trgm_idx" ON "Invoice" USING gin ("number" gin_trgm_ops);
