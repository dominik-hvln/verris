-- C-15/K-03 — zajętość i liczba plików w katalogach konta (zadanie węzła, du jako klient).
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'DISK_USAGE';
