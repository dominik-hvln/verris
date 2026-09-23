-- M-34 — saldo portfela, za które nie powstał dokument przy wpłacie (tylko odczyt).
--
-- Od przełączenia na model `faktury.model = przy_doladowaniu` dokument powstaje przy
-- wpłacie, a wydawanie K dokumentów nie tworzy. K wpłacone WCZEŚNIEJ (bez dokumentu
-- przy wpłacie) i jeszcze niewydane nie dostaną więc dokumentu nigdy. Ten raport pokazuje,
-- ile tego jest na klienta; decyzję (dokument ręczny / korekta / nic) podejmuje operator
-- z księgową, a wynik zapisujemy w macierzy przy M-34.
--
-- Uruchomienie na serwerze (/opt/verris):
--   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < ops/sql/m34-saldo-bez-dokumentu.sql

SELECT
  u.email                                                        AS klient,
  u."walletBalance"                                              AS saldo_k,
  COALESCE(SUM(w.amount) FILTER (WHERE w."invoiceId" IS NULL), 0) AS wplaty_bez_dokumentu_k,
  COALESCE(SUM(w.amount) FILTER (WHERE w."invoiceId" IS NOT NULL), 0) AS wplaty_z_dokumentem_k,
  LEAST(u."walletBalance", COALESCE(SUM(w.amount) FILTER (WHERE w."invoiceId" IS NULL), 0))
                                                                 AS saldo_bez_dokumentu_max_k
FROM "User" u
LEFT JOIN "WalletTransaction" w
  ON w."userId" = u.id AND w.type = 'TOPUP' AND w.status = 'COMPLETED'
WHERE u."walletBalance" > 0
GROUP BY u.id, u.email, u."walletBalance"
ORDER BY saldo_bez_dokumentu_max_k DESC;
