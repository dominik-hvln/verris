-- D-12 — eksport i import bazy klienta z panelu (zadanie węzła, payload.mode = 'export' | 'import').
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'DB_TRANSFER';
