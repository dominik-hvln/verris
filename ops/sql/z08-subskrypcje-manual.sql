-- Z-08 — jednorazowy przegląd subskrypcji MANUAL (tylko odczyt).
--
-- Do 2026-08-21 (Z-02) klient mógł sam założyć subskrypcję z paymentSource=MANUAL,
-- czyli usługę bez płatności. Poprawka zablokowała nowe, ale nie mówi, czy ktoś
-- zdążył skorzystać. Ten raport odpowiada na to pytanie; wynik (liczba wierszy,
-- decyzja) zapisujemy w macierzy przy Z-08, a pozycja znika.
--
-- Uruchomienie na serwerze (/opt/verris):
--   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < ops/sql/z08-subskrypcje-manual.sql
--
-- Wiersz z „utworzył_operator = nie” i bez faktury to kandydat do wyjaśnienia.

SELECT
  s.id                                  AS subskrypcja,
  s."createdAt"::date                   AS utworzona,
  s.status,
  s."priceAmount"                       AS cena,
  u.email                               AS wlasciciel,
  EXISTS (
    SELECT 1 FROM "AuditLog" a
    WHERE a."details"->>'subscriptionId' = s.id
      AND a."actorUserId" IS NOT NULL
      AND a."actorUserId" <> s."userId"
  )                                     AS utworzyl_operator,
  (SELECT count(*) FROM "Invoice" i WHERE i."subscriptionId" = s.id) AS faktury
FROM "Subscription" s
JOIN "User" u ON u.id = s."userId"
WHERE s."paymentSource" = 'MANUAL'
ORDER BY s."createdAt";
