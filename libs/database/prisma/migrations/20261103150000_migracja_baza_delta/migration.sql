-- P2-06 (decyzja 13, 3.11.2026) — dosynchronizowanie bazy sklepu tuż przed przełączeniem DNS.
ALTER TYPE "MigrationWorkerJobKind" ADD VALUE IF NOT EXISTS 'MYSQL_DELTA';
