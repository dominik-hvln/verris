-- F3.2 (D5, 10.10) — zadanie węzła IP_BLOCKS: blokady fail2ban (lista, odblokowanie, biała lista) z panelu operatora.
-- Idempotentna; nowa wartość enumu nie jest używana w tej samej transakcji.

ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'IP_BLOCKS';
