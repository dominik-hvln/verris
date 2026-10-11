-- F3.4 (11.10) — zadanie węzła NODE_SERVICES: stan i restart usług z białej listy, ogon logów (node-services.sh).
-- Idempotentna; nowa wartość enumu nie jest używana w tej samej transakcji.

ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'NODE_SERVICES';
