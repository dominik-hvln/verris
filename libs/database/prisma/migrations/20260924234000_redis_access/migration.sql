-- D-15/J-03 — Redis konta hostingowego (instancja na konto, gniazdo w katalogu konta).
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'REDIS_ACCESS';
