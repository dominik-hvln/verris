# Checklista D3 — zdobycie dowodów na żywym systemie

**Po co to istnieje.** Metoda audytu ma pięć poziomów dowodu, a trzy z nich (D3, D4) da się zdobyć wyłącznie na żywym systemie. Dziś **żadna pozycja macierzy nie ma D3** — nie z zaniedbania, tylko dlatego, że nie ma na czym. Ta checklista zbiera w jednym miejscu wszystko, co trzeba sprawdzić **jednorazowo, przy pierwszym węźle**, żeby zdjąć tę lukę.

Nie jest to lista życzeń. Każda pozycja odpowiada konkretnemu wierszowi macierzy, ma podane polecenie albo kliknięcie, oczekiwany wynik i miejsce, gdzie zapisać rezultat.

## Stan infrastruktury (2026-08-21)

Jeden serwer testowy pełniący rolę **control-plane** (panel + API). **Węzła hostingowego nie ma** — pojawi się, gdy będzie potrzebny.

Dlatego checklista dzieli się na dwie części:

| | Co obejmuje | Kiedy |
|---|---|---|
| **Część A** | To, co da się potwierdzić **na samym control-plane** | Po wdrożeniu tej gałęzi na serwer testowy — czyli od zaraz |
| **Część B** | To, co wymaga żywego węzła z DirectAdminem | Po postawieniu pierwszego węzła |

Podział nie jest kosmetyczny: **Część A zawiera dwa z trzech ustaleń bezpieczeństwa ze sprintów 1–2**. Nie ma powodu, żeby czekały na węzeł.

> **Dlaczego to jest ważne akurat tutaj.** 2026-08-21 okazało się, że trzy rodzaje zadań agenta (`PHP_APPLY`, `APP_INSTALL`, `OFFSITE_RESTORE`) nie mogły się wykonać na produkcji, bo skryptów nie było w obrazie — przy zielonych testach, zielonym buildzie i zielonym typechecku. Pozycja `B-01` miała w macierzy stan `DZIAŁA`. To był najczystszy możliwy przykład tego, czego D1 i D2 nie potrafią udowodnić.

---

# CZĘŚĆ A — control-plane, bez węzła

Wymaga tylko wdrożenia tej gałęzi na serwer testowy panelu.

## A1. Skrypty zadań agenta są w obrazie

Endpointów `/agent/tasks/*/script` nie da się zawołać bez zarejestrowanego węzła (uwierzytelniają się tokenem tożsamości). Ale samą przyczynę awarii — brak pliku w obrazie — widać z control-plane:

```bash
docker exec $(docker ps -qf name=api) ls -la ops/scripts/
```

**Oczekiwane:** dziesięć plików, w tym `node-php-apply.sh`, `node-app-install.sh` i `node-account-restore.sh`.

✅ **Wykonane 2026-08-21 21:57**, po wdrożeniu #62. Wszystkie dziesięć obecne. `X-12` ma D3 — pierwsza pozycja w tym audycie z dowodem tego poziomu.

Konsekwencja dla `B-01`: przyczyna wdrożeniowa usunięta, ale sama pozycja zostaje `CZĘŚCIOWE`. Obecność skryptu w obrazie dowodzi, że endpoint przestanie zwracać 500 — nie dowodzi, że zmiana wersji PHP dociera na konto. Na to potrzeba węzła (Część B).

## A2. `Z-02` — zamówienie usługi bez opłaty

| Co zrobić | Oczekiwany wynik |
|---|---|
| Z konta klienta `POST /subscriptions` z `paymentSource: "MANUAL"` | `400`, komunikat „Niedozwolone źródło płatności dla zamówienia klienta" |
| To samo z `WALLET` przy pustym portfelu | Odrzucone z powodu **braku środków**, nie z powodu źródła |
| Jedenaście zamówień pod rząd w ciągu godziny | Jedenaste odrzucone przez limit tempa (10/h) |

Drugi wiersz jest ważniejszy, niż wygląda: potwierdza, że poprawka nie zablokowała poprawnej ścieżki zakupu.

## A3. `Z-04` — uprawnienia subkonta

Załóż subkonto z **jedynym** uprawnieniem `TICKETS_READ`.

| Co zrobić | Oczekiwany wynik |
|---|---|
| `GET /tickets` | `200` — subkonto robi to, do czego ma prawo |
| `POST /addons/purchase` | `403` |
| `POST /vps` | `403` |
| `POST /me/account-deletion` | `403`, komunikat „dostępne wyłącznie dla właściciela konta" |
| To samo konto po nadaniu `BILLING_MANAGE`: `POST /addons/purchase` | Przechodzi |

Ostatni wiersz sprawdza, że uprawnienia w ogóle coś otwierają — bez niego test dowodzi tylko, że wszystko jest zablokowane.

## A4. `Z-03` — walidacja formularza migracji (część bez węzła)

| Co zrobić | Oczekiwany wynik |
|---|---|
| Zleć migrację z nazwą bazy `test;whoami` | Formularz odrzuca, komunikat o niedozwolonych znakach |
| Zleć migrację ze ścieżką `/home/klient/public_html` | Przechodzi walidację |

Samego przebiegu migracji nie da się sprawdzić bez węzła — to Część B.

---

# CZĘŚĆ B — wymaga węzła

## B0. Zanim zaczniesz

**Kopiuj cały katalog, nie wybrane pliki:**

```
scp -r ops/hosting-default-page ops/scripts root@WĘZEŁ:/root/verris/
ssh root@WĘZEŁ 'bash /root/verris/node-onboard-live.sh'
```

`ops/scripts/lib/` musi pojechać razem — worker migracji bez `lib/migration-input-guard.sh` startuje fail-closed i nie weźmie żadnego zlecenia (`Z-03`). `node-onboard-live.sh` to sprawdza i przerywa z komunikatem, więc pomyłka nie przejdzie po cichu.

Onboarding uruchamia po drodze `node-live-readiness.sh`, który pokrywa warstwę węzła: CloudLinux, DirectAdmin, LiteSpeed, Governor, MariaDB, agent zadań, timery, poczta, FTP. **Ta checklista go nie powtarza** — zaczyna się tam, gdzie tamten kończy: na funkcjach produktu.

---

## B1. Skrypty zadań agenta wracają z API

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

## B2. Funkcje, które zależały od tych skryptów

| ID | Co zrobić | Oczekiwany wynik |
|---|---|---|
| `B-01` | Panel klienta → PHP → zmień wersję PHP **konta**, odczekaj przebieg agenta (do 2 min) | Wersja zmieniona na węźle: `ssh WĘZEŁ 'selectorctl --user-current --user=KONTO'` pokazuje nową |
| `B-02` | Ustaw inną wersję PHP **dla jednej domeny**, potem zmień wersję konta | Domena zachowuje własną wersję; panel wypisuje ją w notce przy karcie konta (`DomainPhpOverridesNote`) |
| `I-01` | Zainstaluj aplikację z autoinstalatora (Nextcloud albo PrestaShop) | Zadanie `APP_INSTALL` kończy się sukcesem, strona odpowiada 200 |
| `H-14` `H-15` | Panel → Kopie zapasowe → „Pokaż kopie poza serwerem" | Lista archiwów wraca; „Pobierz na serwer" ściąga wybrane |
| — | Po pobraniu: „Przywróć z tej kopii" na koncie testowym | Dane wracają; kopia zabezpieczająca powstała przed nadpisaniem |

`B-01` jest tu najważniejsze — to pozycja, która miała `DZIAŁA` i nie działała. Po potwierdzeniu wraca z `CZĘŚCIOWE` na `DZIAŁA`.

---

## B3. Pozycje bezpieczeństwa wymagające węzła

`Z-02` i `Z-04` są w Części A — nie potrzebują węzła. Tutaj zostaje reszta `Z-03`.

| ID | Co zrobić | Oczekiwany wynik |
|---|---|---|
| `Z-03` | Zleć **prawdziwą** migrację z poprawnymi danymi | Przechodzi do końca — walidacja nie może blokować normalnej pracy |
| `Z-03` | Na węźle: `mv /usr/local/sbin/verris-migration-guard.sh /root/ && verris-migration-worker once; echo $?` | `78`, żadne zlecenie nie zostało pobrane. **Przywróć plik po teście.** |

Drugi wiersz jest jedynym testem, który celowo psuje węzeł. Zajmuje kilkanaście sekund i jest jedynym sposobem, żeby potwierdzić, że fail-closed naprawdę działa, a nie tylko tak wygląda w kodzie.

---

## B4. Migracja od konkurencji — pełny przebieg

Jedyna funkcja, która dotyka jednocześnie plików, bazy i poczty na obcym serwerze. Warto ją przejść w całości na koncie testowym u realnego dostawcy (choćby najtańszy pakiet na miesiąc).

- [ ] FTP/SFTP: pliki przeniesione, raport spójności zgadza się co do liczby plików
- [ ] MySQL: baza zaimportowana, raport spójności zgadza się co do liczby wierszy
- [ ] IMAP: skrzynka przeniesiona, drugi przebieg nie duplikuje wiadomości
- [ ] WP fixup: `wp-config.php` wskazuje nową bazę, `search-replace` podmienił domenę
- [ ] Strona odpowiada `200` pod nową domeną

---

---

## Co zapisać i gdzie (dotyczy obu części)

Dla każdej potwierdzonej pozycji:

1. `audyt/dane/macierz.csv` → kolumna `Dowód` dostaje dopisek `D3: RRRR-MM-DD GG:MM`, kolumna `Uwagi` — jednozdaniowy opis tego, co faktycznie sprawdzono.
2. `python3 audyt/generate.py --sprawdz && python3 audyt/generate.py`
3. Jeżeli któraś pozycja **nie** przejdzie — nie poprawiaj jej po cichu w macierzy. Nowe ID, opis objawu, sprint. Pozycja, która nie działa na produkcji, jest luką niezależnie od tego, ile ma testów.

**Nie ma poziomu „prawie D3".** Albo jest data i godzina obserwacji, albo pozycja zostaje na D2.
