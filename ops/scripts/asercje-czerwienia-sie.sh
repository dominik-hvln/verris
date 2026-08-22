#!/usr/bin/env bash
# =============================================================================
# Czy asercje po migracji CZERWIENIĄ SIĘ na złych danych?
#
# Plik asercji, który przechodzi na każdej bazie, nie jest bramką — jest
# ozdobą. Od 2026-08-22 `po-migracji-niezmienniki.sql` biegnie NA PRODUKCJI
# i potrafi wycofać wdrożenie, więc pytanie „czy on w ogóle coś zauważa"
# przestało być teoretyczne.
#
# Ten skrypt psuje po jednym niezmienniku naraz, w transakcji, i sprawdza DWIE
# rzeczy: że psql kończy się kodem różnym od zera ORAZ że powodem jest TA
# asercja, a nie odrzucony INSERT. Bez drugiego warunku skrypt meldowałby
# sukces także wtedy, gdyby żadna asercja nie zadziałała, a wszystko zatrzymał
# CHECK w bazie — czyli byłby testem, który nic nie dowodzi (Z-01, H-20).
#
# Każde naruszenie siedzi w transakcji zakończonej ROLLBACK-iem; przy błędzie
# psql zrywa połączenie i Postgres wycofuje ją sam. Skrypt nie zostawia śladu
# w bazie i NIE WOLNO go uruchamiać na produkcji — jest narzędziem CI.
#
# Połączenie: standardowe zmienne PG* (PGHOST, PGPORT, PGUSER, PGDATABASE,
# PGPASSWORD).
# =============================================================================
set -u

PLIK=${PLIK:-ops/sql/po-migracji-niezmienniki.sql}
PSQL=(psql -v ON_ERROR_STOP=1 -q)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
zle=0

UZY=$("${PSQL[@]}" -tAc 'SELECT id FROM "User" LIMIT 1;' 2>/dev/null || true)
if [[ -z "$UZY" ]]; then
  echo "BŁĄD: w bazie nie ma ani jednego użytkownika — połowa naruszeń nie dałaby się zbudować."
  echo "      Ten skrypt biegnie PO seedzie."
  exit 1
fi

sprawdz() {
  local nazwa="$1" oczekiwane="$2" psucie="$3"
  local f="$TMP/p.sql" wyj kod powod
  {
    echo "BEGIN;"
    echo "$psucie"
    echo "\\i $PLIK"
    echo "ROLLBACK;"
  } > "$f"
  wyj=$("${PSQL[@]}" -f "$f" 2>&1); kod=$?
  powod=$(echo "$wyj" | grep -m1 'ERROR:' | sed 's/.*ERROR:  //')

  if [[ $kod -eq 0 ]]; then
    echo "  NIE ZAUWAŻYŁO: $nazwa"
    zle=$((zle + 1))
  elif [[ "$powod" != $oczekiwane* ]]; then
    # Czerwone z innego powodu to nie jest dowód. Najczęstszy fałszywy sukces:
    # naruszenie odrzucone przez CHECK, zanim asercja zdążyła cokolwiek zobaczyć.
    echo "  ZŁY POWÓD: $nazwa"
    echo "      oczekiwano: ${oczekiwane}…"
    echo "      dostałem:   ${powod:-<brak komunikatu>}"
    zle=$((zle + 1))
  else
    echo "  czerwone: $nazwa"
    echo "      $powod"
  fi
}

echo "== kontrola: nienaruszona baza musi przejść =="
if "${PSQL[@]}" -f "$PLIK" >/dev/null 2>&1; then
  echo "  zielone (dobrze)"
else
  echo "  CZERWONE NA CZYSTEJ BAZIE — asercja jest zepsuta, dalsze wyniki nic nie znaczą."
  "${PSQL[@]}" -f "$PLIK" 2>&1 | grep -m1 'ERROR:' || true
  exit 1
fi

echo "== naruszenia =="

sprawdz "Z-13 plan zniknął, a kod czyta ten slug na sztywno" "Z-13: planu verris-hosting NIE MA" \
  "UPDATE \"Plan\" SET slug = 'inny' WHERE slug = 'verris-hosting';"

# Uwaga: konkretnej ceny (45,00) niezmienniki NIE pilnują — wolno ją zmienić
# z panelu. Pilnują reguły, którą API wymusza przy zapisie: rok >= 6x miesiąc.
sprawdz "Z-13 cennik łamie regułę API (rok tańszy niż 6 miesięcy)" "Z-13: 1 planów ma cennik" \
  "UPDATE \"Plan\" SET \"priceYearly\" = 100 WHERE slug = 'verris-hosting';"

sprawdz "Z-13 plan z niedodatnim limitem bazowym" "Z-13: 1 planów ma niedodatni limit" \
  "UPDATE \"Plan\" SET \"ramLimitMb\" = 0 WHERE slug = 'verris-hosting';"

sprawdz "Z-12 domyślna nadsubskrypcja przestaje być neutralna" "Z-12: Server.overcommitCpu" \
  "ALTER TABLE \"Server\" ALTER COLUMN \"overcommitCpu\" SET DEFAULT 2;"

sprawdz "Z-16 księga węzła rozjeżdża się z kontami" "Z-16:" \
  "INSERT INTO \"Server\" (id,\"ipAddress\",\"allocatedCpu\",\"allocatedMemory\",\"allocatedDisk\",\"updatedAt\")
   VALUES ('srv-czerwien','10.0.0.9',5,0,0,now());"

sprawdz "Z-05 zdarzenie PROCESSED bez daty przetworzenia" "Z-05: 1 zdarzeń ma status PROCESSED" \
  "INSERT INTO \"StripeWebhookEvent\" (id,\"eventId\",\"type\",\"status\",\"processedAt\")
   VALUES ('whe-a','evt_a','invoice.paid','PROCESSED',NULL);"

sprawdz "Z-05 zdarzenie wisi w PENDING bez treści" "Z-05: 1 zdarzeń wisi w PENDING" \
  "INSERT INTO \"StripeWebhookEvent\" (id,\"eventId\",\"type\",\"status\",\"payload\")
   VALUES ('whe-b','evt_b','invoice.paid','PENDING',NULL);"

sprawdz "Z-01 netto + VAT nie daje brutto" "Z-01: 1 faktur ma netto + VAT" \
  "INSERT INTO \"Invoice\" (id,\"userId\",\"number\",\"amount\",\"netAmount\",\"vatAmount\",\"updatedAt\")
   VALUES ('inv-a','$UZY','VFV/9999/08/2026',100,50,10,now());"

# CHECK w bazie pilnuje tego przy zapisie, więc żeby sprawdzić SAMĄ asercję,
# trzeba go zdjąć — czyli odtworzyć ręczną poprawkę w bazie, przed którą
# asercja ma być drugą linią obrony. To jest cały powód, dla którego asercja
# duplikuje CHECK: ograniczenie z czasów sprzed migracji nie obejmie wiersza,
# który ktoś wstawił z psql po jego wyłączeniu.
sprawdz "M-06 korekta bez faktury pierwotnej" "M-06: 1 dokumentów ma niespójny rodzaj" \
  "ALTER TABLE \"Invoice\" DROP CONSTRAINT IF EXISTS \"Invoice_korekta_ma_pierwotna\";
   INSERT INTO \"Invoice\" (id,\"userId\",\"number\",\"amount\",\"kind\",\"updatedAt\")
   VALUES ('inv-k','$UZY','VFK/9999/08/2026',-10,'KOREKTA',now());"

sprawdz "M-06 korekta z numerem spoza serii VFK" "M-06: 1 korekt ma numer spoza serii VFK" \
  "INSERT INTO \"Invoice\" (id,\"userId\",\"number\",\"amount\",\"updatedAt\")
   VALUES ('inv-p','$UZY','VFV/9998/08/2026',100,now());
   INSERT INTO \"Invoice\" (id,\"userId\",\"number\",\"amount\",\"kind\",\"correctedId\",\"correctionKind\",\"correctionReason\",\"updatedAt\")
   VALUES ('inv-k2','$UZY','VFV/9999/08/2026',-10,'KOREKTA','inv-p','WARTOSCIOWA','pomyłka w cenie',now());"

echo
if [[ $zle -gt 0 ]]; then
  echo "WYNIK: $zle naruszeń nie zatrzymało pliku asercji (albo zatrzymało z innego powodu)."
  echo "       Asercja, która tego nie łapie, nie jest bramką wdrożenia."
  exit 1
fi
echo "WYNIK: każde naruszenie zatrzymało plik asercji, i to na właściwej asercji."
