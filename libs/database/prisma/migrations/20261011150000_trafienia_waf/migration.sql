-- F3.2 (10.10) — zadanie węzła WAF_HITS: ostatnie trafienia reguł ModSecurity dla domen konta (tylko odczyt).
-- Idempotentna; nowa wartość enumu nie jest używana w tej samej transakcji.

ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'WAF_HITS';
