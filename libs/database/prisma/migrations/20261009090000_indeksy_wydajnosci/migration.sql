-- Audyt wydajności 09.10 — indeksy na szybko rosnących tabelach (listy klienta/admina, raporty, naliczanie
-- autoskalowania skanowały całe tabele: Seq Scan + Sort). Nazwy wg konwencji Prisma (Tabela_kol_idx).
CREATE INDEX IF NOT EXISTS "Ticket_userId_createdAt_idx" ON "Ticket"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX IF NOT EXISTS "Domain_userId_createdAt_idx" ON "Domain"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoscalingEvent_createdAt_idx" ON "AutoscalingEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AutoscalingEvent_reason_createdAt_idx" ON "AutoscalingEvent"("reason", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_subscriptionId_idx" ON "WalletTransaction"("subscriptionId");
CREATE INDEX IF NOT EXISTS "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_type_createdAt_idx" ON "SubscriptionEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx" ON "User"("role", "createdAt");
CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId");
