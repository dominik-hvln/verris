-- KSeF 07.11 — „KSeF ma w pełni działać automatycznie z naszego panelu” (decyzja Dominika 7.11.2026).
--
-- Do dziś każda nieudana wysyłka była ponawiana w każdym cyklu (co 10 min) bez względu na przyczynę,
-- UPO pobierał na żądanie tylko admin (wywołanie KSeF przy każdym kliknięciu), o zbliżającym się
-- terminie dosłania faktury offline nikt nie był powiadamiany, a korekta techniczna faktury offline
-- (offline/korekta-techniczna.md) nie miała gdzie zapamiętać skrótu odrzuconego pliku.

ALTER TABLE "Invoice"
  -- Nieudane próby z rzędu i termin następnej (backoff); po przyjęciu — próby pobrania UPO.
  ADD COLUMN "ksefProby"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ksefNastepnaProba"    TIMESTAMP(3),
  -- UPO (XML podpisany przez MF) — pobierane raz, automatycznie; klient i admin czytają z bazy.
  ADD COLUMN "ksefUpo"              TEXT,
  -- Ostatni alarm o zbliżającym się terminie dosłania (bez zalewania zespołu co 10 minut).
  ADD COLUMN "ksefAlertTerminuAt"   TIMESTAMP(3),
  -- Korekta techniczna: skrót (SHA-256, Base64URL) odrzuconego pliku faktury offline.
  ADD COLUMN "ksefSkrotKorygowanej" TEXT;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_ksefProby_nieujemne" CHECK ("ksefProby" >= 0);

-- Wybór partii cyklu: kolejka bez faktur czekających na swój termin ponowienia.
CREATE INDEX "Invoice_ksefStatus_ksefNastepnaProba_idx" ON "Invoice"("ksefStatus", "ksefNastepnaProba");
