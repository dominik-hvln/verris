-- Z-16 — uzgodnienie księgi pojemności po przeniesieniu konta między węzłami (H-16).
--
-- 13.10 odtworzenie konta z kopii off-site na innym węźle przepinało `Account.serverId`
-- (servers/node-tasks.service.ts, ACCOUNT_MOVED_TO_NODE), nie przenosząc jego limitów
-- w `Server.allocated*`: stary węzeł dalej liczył konto jako sprzedane, nowy go nie widział.
-- Asercja po migracji (ops/sql/po-migracji-niezmienniki.sql, Z-16) zatrzymywała przez to każde
-- wdrożenie („2 węzłów ma księgę niezgodną z sumą limitów kont żywych”).
--
-- Kod przenosi już limity w tej samej transakcji co serverId. Ta migracja prostuje stan zastany
-- tak samo jak 20260822150000_uzgodnienie_ksiegi_wezla: księga = suma limitów efektywnych kont
-- żywych (status <> DELETED). Dotyka wyłącznie węzłów, na których księga się rozjechała.

UPDATE "Server" s
   SET "allocatedCpu"    = COALESCE(agg.cpu, 0),
       "allocatedMemory" = COALESCE(agg.ram, 0),
       "allocatedDisk"   = COALESCE(agg.disk, 0),
       "updatedAt"       = NOW()
  FROM (
        SELECT srv."id" AS server_id,
               SUM(a."cpuLimit")    AS cpu,
               SUM(a."ramLimitMb")  AS ram,
               SUM(a."diskLimitMb") AS disk
          FROM "Server" srv
          LEFT JOIN "Account" a
                 ON a."serverId" = srv."id"
                AND a."status" <> 'DELETED'
         GROUP BY srv."id"
       ) AS agg
 WHERE s."id" = agg.server_id
   AND (
        s."allocatedCpu"    IS DISTINCT FROM COALESCE(agg.cpu, 0)
     OR s."allocatedMemory" IS DISTINCT FROM COALESCE(agg.ram, 0)
     OR s."allocatedDisk"   IS DISTINCT FROM COALESCE(agg.disk, 0)
       );
