-- H-10/H-11 — podgląd archiwum kopii i odtworzenie pojedynczego pliku (payload.mode = 'list' | 'extract').
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'FILE_RESTORE';
