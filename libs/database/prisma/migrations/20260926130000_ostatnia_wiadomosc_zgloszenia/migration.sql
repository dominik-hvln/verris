-- PB-37 — zgłoszenia sprzed SUP-V2 nie miały „kto napisał ostatni” (NULL). Opieka nad zgłoszeniem
-- („wciąż nad tym pracujemy”, „co widzi klient”) potrzebuje tej wartości — uzupełniamy z wątku
-- (ostatnia wiadomość napisana przez człowieka; bez odpowiedzi = ostatni jest klient, przy utworzeniu).
UPDATE "Ticket" t
SET "lastReplyAt" = r."createdAt", "lastReplyIsStaff" = r."isStaff"
FROM (
  SELECT DISTINCT ON ("ticketId") "ticketId", "createdAt", "isStaff"
  FROM "TicketReply"
  WHERE "automatic" IS NULL
  ORDER BY "ticketId", "createdAt" DESC
) r
WHERE r."ticketId" = t."id" AND t."lastReplyIsStaff" IS NULL;

UPDATE "Ticket"
SET "lastReplyAt" = COALESCE("lastReplyAt", "createdAt"), "lastReplyIsStaff" = false
WHERE "lastReplyIsStaff" IS NULL;
