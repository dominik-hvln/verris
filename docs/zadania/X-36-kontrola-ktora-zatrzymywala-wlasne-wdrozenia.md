# `X-36` — Kontrola bezpieczeństwa, która zatrzymywała własne wdrożenia

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe (praca odkryta) |
| **Priorytet** | KRYTYCZNY (blokowała ścieżkę wdrożeniową, a przez nią D3 dla `Z-12`, `Z-16`, `X-17`) |
| **Nakład** | M (~5 h) |
| **Zależy od** | `X-35` (jego alarm zasłaniał to znalezisko) |
| **Status** | **ZAMKNIĘTE — D3 na wdrożeniu #80** |
| **Data** | 2026-08-24 / 25 |

---

## Co się stało

Wdrożenie **#77** padło o 22:00 UTC na `compose pull`. W `kern.log` z tych dwóch
minut **63 dropy** `VERRIS-ANTISCAN-DROP`, wszystkie do `140.82.121.33/34` —
czyli do `ghcr.io`, skąd idą nasze własne obrazy.

Skrypt wdrożeniowy zginął pod `set -Eeuo pipefail`, **nie wypisawszy żadnego ze
swoich komunikatów** — przeszukanie logu po frazie `[deploy] FAIL` daje zero
trafień. Nie zatrzymała go żadna bramka. Zabiło go polecenie bez osłony.

Tak samo padły **#78** (22:40) i **#79** (22:57).

## Jak to znaleźliśmy

Nie przez ten alarm — ten alarm **nie działał**. Reguła
`verris_security_findings > 0` paliła się nieprzerwanie od czerwca przez inną
usterkę (`X-35`), więc każde nowe znalezisko wpadało do alertu, który już był
czerwony. Skrypt `security-egress-watch.sh` widział te dropy i zapisywał je
jako `INFO`, sumując do tego samego licznika co `CRITICAL`.

Znaleźliśmy je, czytając 81-bajtowe pliki raportów po tym, jak `X-35` przestał
zasłaniać widok.

## Trzy usterki, nie jedna

### 1. `--rsource` w łańcuchu OUTPUT to jedno wiadro

```
-m recent --update --seconds 60 --hitcount 80 --name verris_eg_new --rsource -j DROP
```

W OUTPUT **źródłem każdego pakietu jesteśmy my**, więc lista `recent` ma
dokładnie jeden wpis. Reguła nie mierzy różnorodności celów — nie ma o niej
pojęcia — tylko sumuje wszystkie nowe połączenia web hosta. To globalna
przepustnica z etykietą „anty-skan": `docker pull`, `apt`, `certbot`, mapy
rspamd i sondy do węzłów dzielą jeden budżet.

Licznik reguły: **287 tys.** nowych połączeń, z tego **1761** dropniętych —
sześć promili, i wszystkie sześć promili trafiło w `docker pull`, bo tylko
wtedy przekraczamy próg.

### 2. `hitcount 300` przekracza limit jądra — skrypt padał od czerwca

```
RULE_APPEND failed (Invalid argument): rule in chain VERRIS_ANTISCAN
```

Moduł `xt_recent` ma stałą `XT_RECENT_MAX_NSTAMPS = 256` i odrzuca każdą regułę
z `--hitcount` ≥ tej wartości. Maksimum to **255**. Wpisane w skrypcie 300 nie
mieściło się **nigdy**.

Skrypt umierał w tym miejscu, zostawiając łańcuch **zbudowany do połowy** —
z warstwą szybką i bez wolnej. To jest odpowiedź na pytanie, nad którym
siedzieliśmy pół dnia: dlaczego uruchomiony łańcuch nie zgadza się ze skryptem.
Nie było żadnej ręcznej edycji ani dryfu konfiguracji. **Skrypt nigdy nie
zdołał wykonać się do końca**, a padał bez własnego komunikatu, po trzech
zielonych linijkach.

Warstwa wolna (300/900 s) została dopisana po incydencie Hetznera z
2026-06-11 — wolny skan ~1/s do ~256 hostów. **Ochrona dodana po realnym
incydencie nie działała ani jednego dnia.**

### 3. Allowlista oparta na nazwach starzeje się przy rotacji DNS

```
22:46  getent ahostsv4 ghcr.io   →  do ipsetu trafiło 140.82.121.34
22:57  docker pull              →  poszedł na 140.82.121.33
       dial tcp 140.82.121.33:443: i/o timeout        (54 dropy)
```

`ghcr.io` ma kilka rekordów A i rozwiązuje się naprzemiennie. Zbiór zbudowany
z jednego odczytu DNS obejmuje część adresów usługi. Dopisanie `.33` nie jest
naprawą — jutro DNS zwróci `.35`.

## Czego NIE zrobiliśmy

**Nie podnieśliśmy progu.** Czterdzieści wybrano po incydencie z 11 czerwca
i podniesienie go rozbroiłoby kontrolę dokładnie tam, gdzie raz już zawiodła.

**Nie przestawiliśmy na `--rdest`.** Kusiło, bo brzmi jak naprawa „liczy źle,
niech liczy per cel". Ale per-cel liczy połączenia do *tego samego* adresu —
skan po 256 hostach z jednym połączeniem na host nie ruszyłby licznika ani
razu, a `docker pull`, który wali w dwa adresy GHCR, nadal by padał. Zamiana
jednej niewłaściwej miary na drugą.

**Nie dopisaliśmy brakującego adresu do listy nazw.** Naprawiłoby to jeden
przebieg i zostawiło mechanizm zepsuty.

## Rozwiązanie

**Cele z allowlisty wychodzą z łańcucha PRZED licznikiem.** Dzięki temu licznik
mierzy wreszcie coś sensownego: nowe połączenia do miejsc, **których nie
znamy** — a to jest znacznie bliżej sygnatury skanu niż „wszystko, co host
wysyła". Próg 40 zostaje ostry.

**Zakresy CIDR obok nazw.** Nowy plik `egress-allow-nets.txt`; zbiór jest typu
`hash:net`, więc podsieć wchodzi jako jeden wpis i nie starzeje się przy
rotacji DNS. Pierwszy wpis: `140.82.112.0/20`, alokacja GitHuba potwierdzona
w RDAP ARIN (NetName GITHU) — nie „chyba należy do".

**Hitcount klamrowany do 255**, jawnie i głośno, zamiast pozwalać iptables
odrzucić regułę i wywrócić skrypt w połowie łańcucha. Domyślna wartość wolnej
warstwy to teraz 250 — w oknie 900 s daje ~17 połączeń na minutę wobec ~20 przy
trzystu, więc intencja zostaje nietknięta.

**Zbiór odświeżany przez `ipset swap`, nie `flush`.** Przy włączonym `--strict`
między flushem a ostatnim `add` lista jest niepełna, więc reguła
`! --match-set … -j DROP` odcina wszystko, czego jeszcze nie dodano. Podmiana
atomowa nie ma tego okna.

**Tryb `--allowlist` wydzielony z `--strict`.** Wcześniej ipset powstawał
wyłącznie razem z regułą odrzucającą wszystko spoza listy — kto chciał samego
zbioru, musiał włączyć blokowanie całego ruchu web hosta. Wszystko albo nic,
na produkcji.

### Osobno: `security-egress-watch.sh`

**Snapshot crona liczy treść, nie listing.** Poprzednia wersja hashowała wyjście
`ls -la`, w którym siedzi wpis `..` — czyli mtime `/etc`. To nie był odcisk
crona, tylko detektor zmian w całym `/etc` z etykietą „cron integrity". Pierwszy
pakiet, który cokolwiek zapisał w `/etc` (unattended-upgrades, 4 czerwca
06:19:31), zamknął sprawę na zawsze: od tamtej pory WARN palił się bez przerwy,
więc detektor nie wykrywał już **niczego**.

Zmierzone na nowej wersji:

| co zrobiłem | hash |
|---|---|
| przebieg 1 | `29e5b888…` |
| przebieg 2, bez zmian | `29e5b888…` — stabilny |
| zapis do `/etc` | `29e5b888…` — **obojętny** |
| dodanie pliku do `cron.d` | `3c25169c…` |
| zmiana treści pliku | `e881525c…` |
| zmiana uprawnień | `a0ccbbd3…` |
| usunięcie pliku | `29e5b888…` — powrót |

**Raport istnieje wtedy i tylko wtedy, gdy są znaleziska.** Poprzednio powstawał
zawsze, także pusty: 288 plików na dobę, ~24 tys. i ~90 MB bez rotacji. Gorsze
było znaczenie: plik 0-bajtowy znaczył „przebieg czysty" **albo** „przebieg
umarł przed zapisaniem czegokolwiek". Ta sama choroba co w `X-35`, tylko na
dysku zamiast w PromQL — pustka jako nośnik dwóch sprzecznych znaczeń.

Do tego retencja (30 dni / 13 miesięcy dla audytów), osłona `|| true` na `ss`
w podstawieniu polecenia (bez niej jedno potknięcie zabijało przebieg przed
zapisem metryki) i usunięcie martwego `ANTISCAN_DROPS`.

## Dowód D3 — wdrożenie #80

Przepowiednia zapisana przed uruchomieniem: `ipset test` dla `140.82.121.33`
przejdzie z `BRAK` na `JEST`, łańcuch zbuduje się w całości do dziewięciu reguł,
a wdrożenie przejdzie `compose pull` bez ani jednego nowego dropu.

```
23:25:45  allow-net 140.82.112.0/20
          ipset verris_egress_https: 76 adresów (podmiana atomowa)
23:25:50  ipset test 140.82.121.33  →  JEST        (przed: BRAK)
23:25:57  Anti-netscan: cele z ipset zwolnione z licznika
23:25:57  Anti-netscan: >40/60s (burst) i >250/900s (wolny) → DROP
23:25:57  Control-plane egress hardening applied
          iptables -S VERRIS_ANTISCAN  →  9 reguł
```

Linia `Control-plane egress hardening applied` **nie padła ani razu od
czerwca** — skrypt zawsze umierał wcześniej.

**Wdrożenie #80: zielone, 9 m 43 s, pełny pipeline łącznie z deployem po SSH.**
Pierwsze zielone od `#74` o 12:56. W `kern.log` z minut wdrożenia **zero**
nowych dropów; ostatnia minuta z dropami to nadal `22:58`, czyli `#79`.

Obrazy w kontenerach: `ca628679…` — zgodne z `origin/main` co do znaku.

## Czego ten dowód NIE obejmuje

**Zimnego cache'u obrazów.** Warstwy (blob) idą przez
`pkg-containers.githubusercontent.com`, który siedzi na CDN-ie z zupełnie inną
pulą adresów niż `/20` GitHuba. Wdrożenie #80 pobierało obrazy w dużej części
z cache'u, więc nie wiemy, czy pełne pobranie też przejdzie. Pierwszy deploy
po `docker image prune -af` to rozstrzygnie.

**Rozdzielenia wag znalezisk.** `record()` nadal inkrementuje ten sam licznik
dla `CRITICAL`, `WARN` i `INFO`, więc ustanowione połączenie do znanego IOC waży
tyle samo co notka o zadziałaniu firewalla. To jest powód, dla którego te dropy
były niewidoczne, i **nie zostało naprawione**.

**Strażnika nie ma.** Do napisania: test asertujący, że `ANTISCAN_*_HITCOUNT`
nie przekracza limitu `xt_recent`, i że w `apply_antiscan` zwolnienie
z allowlisty stoi PRZED regułami licznika. Bez niego `X-36` naprawia stan, a nie
mechanizm.

## Znaleziska poboczne, do backlogu

- **`--strict` melduje się jako zastosowany i nie blokuje niczego.** Łańcuch
  `VERRIS_EGRESS_STRICT` wisi w OUTPUT i zawiera dwa `RETURN`-y bez `DROP` —
  skrypt pomija blokowanie, gdy `-m cgroup` nie działa, wypisuje WARN i idzie
  dalej. Allowlista jest w tej chwili ozdobą.
- **Wdrożenie zostawia detached HEAD.** `prod-deploy-ghcr.sh` robi
  `git checkout $IMAGE_TAG` i nie wraca na gałąź, więc każdy kolejny `git pull`
  na Panelu kończy się „You are not currently on a branch".
- **`.env.prod` nie był ignorowany** przez git — naprawione przy okazji.
- **Brak rotacji** dla `/var/log/verris-security/` — naprawione retencją.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-35` | jego fałszywy alarm zasłaniał to znalezisko przez trzy tygodnie |
| `X-28` | ten sam wzorzec: sygnał istnieje i nie dociera — tu przez stały czerwony |
| `Z-12`, `Z-16`, `X-17` | czekały na D3, czyli na zielone wdrożenie; ścieżka jest drożna |

## Dowód po

- `ops/scripts/security-control-plane-egress.sh` — zwolnienie z allowlisty przed
  licznikiem, klamrowanie hitcountu, `ipset swap`, tryb `--allowlist`
- `ops/etc/verris/security/egress-allow-nets.txt` — zakresy CIDR, zasada
  „tylko potwierdzone w rejestrze"
- `ops/etc/verris/security/egress-allow-hostnames.txt` — `ghcr.io`,
  `pkg-containers`, mirrory apt
- `ops/scripts/security-egress-watch.sh` — hash treści crona z `diff`, raport
  tylko przy znaleziskach, retencja, odporność na `set -e`

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 — pomiary hasha i `ipset test` · [x] **D3 — wdrożenie #80
  zielone, zero dropów** · [ ] D4
