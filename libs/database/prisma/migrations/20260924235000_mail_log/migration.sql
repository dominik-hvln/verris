-- E-19 — dziennik dostarczania poczty konta (zadanie węzła; log exima, tylko domeny konta).
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'MAIL_LOG';
