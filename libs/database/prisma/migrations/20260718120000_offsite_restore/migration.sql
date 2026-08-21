-- S-1 — self-restore konta z kopii OFF-SITE w panelu klienta.
-- Nowy rodzaj zadania węzła: listowanie i ściąganie archiwum z remote rclone
-- (payload.mode = 'list' | 'fetch').
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'OFFSITE_RESTORE';
