-- C-21/C-22 — SSH w klatce CageFS i klucze SSH konta hostingowego (payload.mode = 'enable' | 'disable' | 'keys').
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'SSH_ACCESS';
