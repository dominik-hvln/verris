-- =============================================================================
-- Verris — dodatkowe widoki PII-safe dla Grafany (support + monitoring www)
-- =============================================================================
-- Kontekst: grafana_ro ma SELECT tylko na istniejących widokach *_safe
-- (user_safe, server_safe, account_safe, subscription_safe, wallet_transaction_safe,
--  invoice_safe, usage_metric_safe, autoscaling_event_safe, probe_sample_safe,
--  probe_incident_safe — patrz migracja 0_init).
--
-- Poniższe widoki odsłaniają tylko kolumny operacyjne (bez treści wiadomości,
-- komentarzy CSAT, powodów eskalacji itp.), by zasilić dashboardy:
--   - Support / Helpdesk (najczęstsze tematy, najlepsi pracownicy, oceny CSAT, SLA)
--   - Monitoring www/usług (czas odpowiedzi, TLS expiry)
--
-- WDROŻENIE: przenieś ten plik do nowej migracji Prisma, np.
--   libs/database/prisma/migrations/2026XXXX_grafana_support_monitoring_safe/migration.sql
-- (NIE uruchamiaj ad-hoc na produkcji z pominięciem historii migracji.)
-- =============================================================================

-- --- Tickety: bez treści (subject/message), bez komentarza CSAT i pól ryzyka ---
CREATE OR REPLACE VIEW public.ticket_safe AS
SELECT
    "id", "status", "priority", "department", "topic",
    "userId", "assignedToId",
    "firstResponseAt", "resolvedAt",
    "csatRating", "csatAt",
    "slaResponseDueAt", "slaResolveDueAt",
    "escalatedAt",
    "createdAt", "updatedAt"
FROM public."Ticket";

-- --- Odpowiedzi na tickety: bez treści wiadomości ---
CREATE OR REPLACE VIEW public.ticket_reply_safe AS
SELECT
    "id", "ticketId", "authorId", "isStaff", "createdAt"
FROM public."TicketReply";

-- --- Monitoring www: bez lastError (może zawierać wrażliwe dane URL/nagłówków) ---
CREATE OR REPLACE VIEW public.site_monitor_safe AS
SELECT
    "id", "subscriptionId", "enabled", "url",
    "lastStatus", "consecutiveFails", "lastCheckedAt",
    "lastHttpStatus", "lastResponseMs", "downSince",
    "tlsExpiresAt", "tlsCheckedAt",
    "paidTier",
    "createdAt", "updatedAt"
FROM public."SiteMonitor";

CREATE OR REPLACE VIEW public.site_monitor_event_safe AS
SELECT
    "id", "monitorId", "type", "httpStatus", "durationS", "createdAt"
FROM public."SiteMonitorEvent";

-- --- Uprawnienia ---
GRANT SELECT ON
    public.ticket_safe,
    public.ticket_reply_safe,
    public.site_monitor_safe,
    public.site_monitor_event_safe
TO grafana_ro;
