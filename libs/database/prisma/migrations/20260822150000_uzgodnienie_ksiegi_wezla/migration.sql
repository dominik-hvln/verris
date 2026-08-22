-- Z-16 — uzgodnienie księgi pojemności węzła z rzeczywistością.
--
-- Trzy niezależne przecieki sprawiały, że `Server.allocated*` rozjeżdżało się
-- z tym, co węzeł naprawdę komuś obiecał:
--
--  1. AUTOSKALOWANIE dodawało nadwyżkę w DirectAdminie, nie zapisując jej
--     w księdze. Węzeł wyglądał na luźniejszy, niż był.
--
--  2. USUNIĘCIE KONTA (compliance/account-deletion.service.ts) oznaczało konto
--     jako DELETED i czyściło je w DirectAdminie, ale nigdy nie zwalniało
--     limitów w księdze. Węzeł wyglądał na pełniejszy, niż był — i z czasem
--     przestawał przyjmować konta, mając mnóstwo miejsca.
--
--  3. Skutkiem obu: dryf narastał w obie strony i nic go nie prostowało.
--
-- Poprawki blokują przecieki na przyszłość. Ta migracja prostuje przeszłość —
-- bo poprawka, która nic nie mówi o stanie zastanym, zostawia bazę z liczbami,
-- których nikt już nie umie wytłumaczyć.
--
-- `Account.cpuLimit/ramLimitMb/diskLimitMb` to limity EFEKTYWNE (baza planu
-- plus nadwyżka autoskalowania) — ustawia je applyChange w silniku
-- autoskalowania i provisioning przy zakładaniu konta. Są więc dokładnie tym,
-- co węzeł ma zarezerwowane dla danego konta.
--
-- Konta DELETED nie liczą się: nie istnieją już w DirectAdminie.

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
