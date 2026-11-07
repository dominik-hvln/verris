-- Paczka 121 (7.11.2026) – Verris Kreator: publikacja strony. Na domenę klienta (pliki na koncie hostingu, kopia
-- poprzedniej zawartości poza public_html) albo – w okresie próbnym – link podglądu ważny 7 dni (token HMAC,
-- unieważniany przez podgladDo = NULL i przy usunięciu strony). publikacjaOd = blokada równoległych publikacji.

-- AlterTable
ALTER TABLE "KreatorStrona" ADD COLUMN     "adres" TEXT,
ADD COLUMN     "subskrypcjaId" TEXT,
ADD COLUMN     "katalog" TEXT,
ADD COLUMN     "kopia" TEXT,
ADD COLUMN     "podgladDo" TIMESTAMP(3),
ADD COLUMN     "publikacjaOd" TIMESTAMP(3);
