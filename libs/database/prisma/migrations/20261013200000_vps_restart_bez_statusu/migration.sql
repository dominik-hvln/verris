-- Audyt 13.10 — restart VPS-a zapisywał status REBOOTING, którego nic nie cofało. Odnowienia
-- (vps-renewal.scheduler.ts) biorą tylko RUNNING/STOPPED, więc taki VPS wypadał z obciążeń,
-- wstrzymania za brak płatności i usunięcia po karencji. Kod nie zapisuje już REBOOTING;
-- restartowany serwer działa — istniejące wiersze wracają do RUNNING.
UPDATE "VpsInstance" SET "status" = 'RUNNING', "updatedAt" = NOW() WHERE "status" = 'REBOOTING';
