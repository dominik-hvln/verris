# Checklista D3 — pierwszy węzeł po uruchomieniu

**Po co to istnieje.** Metoda audytu ma pięć poziomów dowodu, a trzy z nich (D3, D4) da się zdobyć wyłącznie na żywym systemie. Dziś **żadna pozycja macierzy nie ma D3** — nie z zaniedbania, tylko dlatego, że nie ma na czym. Ta checklista zbiera w jednym miejscu wszystko, co trzeba sprawdzić **jednorazowo, przy pierwszym węźle**, żeby zdjąć tę lukę.

Nie jest to lista życzeń. Każda pozycja odpowiada konkretnemu wierszowi macierzy, ma podane polecenie albo kliknięcie, oczekiwany wynik i miejsce, gdzie zapisać rezultat.

> **Dlaczego to jest ważne akurat tutaj.** 2026-08-21 okazało się, że trzy rodzaje zadań agenta (`PHP_APPLY`, `APP_INSTALL`, `OFFSITE_RESTORE`) nie mogły się wykonać na produkcji, bo skryptów nie było w obrazie — przy zielonych testach, zielonym buildzie i zielonym typechecku. Pozycja `B-01` miała w macierzy stan `DZIAŁA`. To był najczystszy możliwy przykład tego, czego D1 i D2 nie potrafią udowodnić.

---

## 0. Zanim zaczniesz

**Kopiuj cały katalog, nie wybrane pliki:**

```
scp -r ops/hosting-default-page ops/scripts root@WĘZEŁ:/root/verris/
ssh root@WĘZEŁ 'bash /root/verris/node-onboard-live.sh'
```

`ops/scripts/lib/` musi pojechać razem — worker migracji bez `lib/migration-input-guard.sh` startuje fail-closed i nie weźmie żadnego zlecenia (`Z-03`). `node-onboard-live.sh` to sprawdza i przerywa z komunikatem, więc pomyłka nie przejdzie po cichu.

Onboarding uruchamia po drodze `node-live-readiness.sh`, który pokrywa warstwę węzła: CloudLinux, DirectAdmin, LiteSpeed, Governor, MariaDB, agent zadań, timery, poczta, FTP. **Ta checklista go nie powtarza** — zaczyna się tam, gdzie tamten kończy: na funkcjach produktu.

---

## 1. Skrypty zadań agenta wracają z API

Trzy endpointy, które do 2026-08-21 zwracały 500 w obrazie produkcyjnym. Sprawdzenie zajmuje pół minuty i zamyka `X-12` na poziomie D3.

```bash
# na węźle, z tokenem tożsamości z /etc/verris.conf
source /etc/verris.conf
for ep in php-apply app-install offsite-restore; do
  kod=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $VERRIS_IDENTITY_TOKEN" \
    "$VERRIS_API_URL/agent/tasks/$ep/script")
  echo "$ep -> $kod"
done
```

**Oczekiwane:** trzy razy `200`. Każde `500` oznacza brakujący `COPY` w `Dockerfile.api` — test `dockerfile-scripts.spec.ts` powinien był to złapać wcześniej, więc `500` tutaj znaczy też, że test ma dziurę.

| ID | Pozycja | Zapis wyniku |
|---|---|---|
| `X-12` | Skrypty węzła w obrazie | macierz → `Dowód`, dopisz datę i `200` |

---

## 2. Funkcje, które zależały od tych skryptów

| ID | Co zrobić | Oczekiwany wynik |
|---|---|---|
| `B-01` | Panel klienta → PHP → zmień wersję PHP **konta**, odczekaj przebieg agenta (do 2 min) | Wersja zmieniona na węźle: `ssh WĘZEŁ 'selectorctl --user-current --user=KONTO'` pokazuje nową |
| `B-02` | Ustaw inną wersję PHP **dla jednej domeny**, potem zmień wersję konta | Domena zachowuje własną wersję; panel wypisuje ją w notce przy karcie konta (`DomainPhpOverridesNote`) |
| `I-01` | Zainstaluj aplikację z autoinstalatora (Nextcloud albo PrestaShop) | Zadanie `APP_INSTALL` kończy się sukcesem, strona odpowiada 200 |
| `H-14` `H-15` | Panel → Kopie zapasowe → „Pokaż kopie poza serwerem" | Lista archiwów wraca; „Pobierz na serwer" ściąga wybrane |
| — | Po pobraniu: „Przywróć z tej kopii" na koncie testowym | Dane wracają; kopia zabezpieczająca powstała przed nadpisaniem |

`B-01` jest tu najważniejsze — to pozycja, która miała `DZIAŁA` i nie działała. Po potwierdzeniu wraca z `CZĘŚCIOWE` na `DZIAŁA`.

---

## 3. Pozycje bezpieczeństwa z sprintu 1–2

Wszystkie trzy mają D2, żadna nie ma D3. Każda dotyczy pieniędzy albo dostępu, więc D3 jest **wymagane**, nie opcjonalne.

| ID | Co zrobić | Oczekiwany wynik |
|---|---|---|
| `Z-02` | Z konta klienta wyślij `POST /subscriptions` z `paymentSource: "MANUAL"` | `400` z komunikatem „Niedozwolone źródło płatności dla zamówienia klienta" |
| `Z-02` | To samo z `WALLET` przy pustym portfelu | Odrzucone z powodu braku środków, **nie** z powodu źródła — czyli walidacja nie blokuje poprawnej ścieżki |
| `Z-03` | Zleć migrację z nazwą bazy `test;whoami` | Formularz odrzuca, komunikat o niedozwolonych znakach |
| `Z-03` | Zleć **prawdziwą** migrację z poprawnymi danymi | Przechodzi do końca — walidacja nie może blokować normalnej pracy |
| `Z-03` | Na węźle: `mv /usr/local/sbin/verris-migration-guard.sh /root/ && verris-migration-worker once; echo $?` | `78`, żadne zlecenie nie zostało pobrane. **Przywróć plik po teście.** |
| `Z-04` | Załóż subkonto z jedynym uprawnieniem `TICKETS_READ` | `GET /tickets` działa |
| `Z-04` | Tym samym subkontem: `POST /addons/purchase` | `403` |
| `Z-04` | Tym samym subkontem: `POST /me/account-deletion` | `403` z komunikatem „dostępne wyłącznie dla właściciela konta" |

Test `Z-03` z przeniesieniem guarda jest jedynym, który celowo psuje węzeł. Zajmuje kilkanaście sekund i jest jedynym sposobem, żeby potwierdzić, że fail-closed naprawdę działa, a nie tylko tak wygląda w kodzie.

---

## 4. Migracja od konkurencji — pełny przebieg

Jedyna funkcja, która dotyka jednocześnie plików, bazy i poczty na obcym serwerze. Warto ją przejść w całości na koncie testowym u realnego dostawcy (choćby najtańszy pakiet na miesiąc).

- [ ] FTP/SFTP: pliki przeniesione, raport spójności zgadza się co do liczby plików
- [ ] MySQL: baza zaimportowana, raport spójności zgadza się co do liczby wierszy
- [ ] IMAP: skrzynka przeniesiona, drugi przebieg nie duplikuje wiadomości
- [ ] WP fixup: `wp-config.php` wskazuje nową bazę, `search-replace` podmienił domenę
- [ ] Strona odpowiada `200` pod nową domeną

---

## 5. Co zapisać i gdzie

Dla każdej potwierdzonej pozycji:

1. `audyt/dane/macierz.csv` → kolumna `Dowód` dostaje dopisek `D3: RRRR-MM-DD GG:MM`, kolumna `Uwagi` — jednozdaniowy opis tego, co faktycznie sprawdzono.
2. `python3 audyt/generate.py --sprawdz && python3 audyt/generate.py`
3. Jeżeli któraś pozycja **nie** przejdzie — nie poprawiaj jej po cichu w macierzy. Nowe ID, opis objawu, sprint. Pozycja, która nie działa na produkcji, jest luką niezależnie od tego, ile ma testów.

**Nie ma poziomu „prawie D3".** Albo jest data i godzina obserwacji, albo pozycja zostaje na D2.
