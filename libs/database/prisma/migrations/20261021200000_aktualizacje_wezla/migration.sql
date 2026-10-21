-- 21.10 — weryfikator aktualizacji bezpieczeństwa: raport agenta węzła o oczekujących poprawkach (dnf --security z CVE,
-- CustomBuild, wersje alt-php). Addytywna i idempotentna (nowe, opcjonalne kolumny) — „migrate deploy, potem kod” bezpieczne.
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "aktualizacje" JSONB;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "aktualizacjeAt" TIMESTAMP(3);
