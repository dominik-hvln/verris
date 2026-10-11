-- Audyt Fali 3 (11.10) — źródło wiadomości zgłoszenia: kto napisał treść (Ticket.message) i odpowiedź (TicketReply).
-- Dowodem klienta dla operacji L2 (odblokowanie IP z adresu ze zgłoszenia) i kosztowych/nieodwracalnych na prośbę
-- klienta (dodatek z portfela, skrócenie okresu, cofnięcie rezygnacji) jest tylko wiadomość napisana przez klienta
-- zalogowanego w panelu: 'PANEL'. Pozostałe: 'EMAIL' (import poczty — nadawca niezweryfikowany), 'OBSLUGA' (w imieniu
-- klienta albo przypisane z „Poczty bez klienta”), 'IMPERSONACJA' (operator „jako klient”), 'SYSTEM' (automat).
-- NULL = wiersz sprzed tej migracji, źródło nieznane → nie jest dowodem (wariant zachowawczy, bez zgadywania wstecz).
-- Addytywna i idempotentna (kolumny dopuszczają NULL, bez wartości domyślnej). Stary kod kolumn nie czyta ani nie pisze,
-- więc kolejność „migrate deploy, potem kod” jest bezpieczna.
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "zrodlo" TEXT;
ALTER TABLE "TicketReply" ADD COLUMN IF NOT EXISTS "zrodlo" TEXT;
