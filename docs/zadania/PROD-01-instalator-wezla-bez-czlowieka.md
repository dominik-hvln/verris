# `PROD-01` — Instalator węzła, który zastępuje administratora

| | |
|---|---|
| **Sprint** | nowy zakres produktowy |
| **Priorytet** | WYSOKA |
| **Nakład** | L — do rozbicia na etapy |
| **Zależy od** | `OPS-01` (status węzła musi przestać kłamać) |
| **Status** | **rozpisane, nie zaczęte** |
| **Data** | 2026-08-26 |

---

## Cel

Instalator ma robić sam wszystko, co da się wykryć i zdecydować bez człowieka, a prowadzić
go wyłącznie tam, gdzie decyzja naprawdę należy do człowieka. Dziś ludzkich dotknięć jest
**28**.

## Stan faktyczny — i główny problem, którym nie jest brak automatyki

W panelu admina istnieją **dwie niepołączone ścieżki dodania węzła**, obie działające:

| | `/nodes/wizard` | „bootstrap v2" na `/nodes/[id]#bootstrap` |
|---|---|---|
| kroków | 9, z czego 1 z formularzem | 7 faz automatycznych |
| skrypt | `generateBootstrapScript` (stary) | `node-bootstrap.script.ts` — systemd oneshot, **wznawialny** |
| licencje DA/CL/LS | wklejane ręcznie na SSH | **szyfrowane w bazie**, wstrzykiwane do skryptu |
| CloudLinux, DirectAdmin, LiteSpeed | 3 kroki „skopiuj i wklej", instalatory interaktywne | fazy `CLOUDLINUX` (z rebootem), `DA`, `STACK` — bezobsługowe |
| postęp | 9 kafelków, bez procentu | **żywy postęp 7 faz**, polling 5 s, historia zdarzeń |
| onboard LIVE | ręczny `scp` + `ssh` | agent zadań po `CANARY` |
| NS glue w OVH | ręcznie przed akceptacją | automat po `CANARY/STARTED` |

**Wizard nie wspomina o v2 ani razu.** Nowszy, lepszy tor jest schowany na podstronie węzła
i widoczny tylko przy statusie `INIT`/`PENDING_APPROVAL`.

Do tego **dwa runbooki mówią coś przeciwnego**:

- `ops/docs/NODE_ONBOARD_RUNBOOK.md` — faza 3 to `scp` bundla i `node-onboard-live.sh`.
- `ops/docs/NODE_BOOTSTRAP_V2.md` §9 — *„bootstrap panelu pozostaje jedynym skryptem na węźle […]
  `node-onboard-live.sh` pozostaje narzędziem awaryjnym/ops, nie »docelowym« stanem LIVE"*.

Wizard realizuje wersję A. Dokument decyzyjny mówi B.

**Zadanie nie polega więc na dopisaniu automatyki, tylko na wybraniu jednej ścieżki
i usunięciu drugiej.** Automatyka w większości już istnieje — po prostu nie jest tą, którą
panel pokazuje operatorowi.

## Decyzja do podjęcia (nie moja)

**Rekomendacja: v2 jest ścieżką docelową, wizard 9-krokowy zostaje z niej przepisany.**

Uzasadnienie: v2 jest wznawialny (systemd oneshot przeżywa reboot po CloudLinuksie i zerwane
SSH — dwa najczęstsze miejsca, w których stary wizard się rozpada), raportuje fazy do API
zamiast polegać na deklaracji operatora, i trzyma licencje w bazie zamiast w historii powłoki.

Cena: sekrety licencyjne trafiają do bazy control-plane. Nagłówek starego wizarda mówi wprost
*„sekrety licencyjne nie trafiają do panelu"* — v2 tę zasadę już złamał, tylko nikt tego nie
odnotował jako zmiany polityki. **To wymaga świadomej decyzji, nie milczącego przyjęcia.**

## Zakres — co instalator ma robić sam

Podział wg tego, czy przeszkoda jest techniczna, czy naprawdę ludzka.

### Da się zautomatyzować, dziś nie jest

| # | Dziś | Docelowo |
|---|---|---|
| 1 | region wpisywany wolnym tekstem, bez walidacji | słownik regionów; brak wpisu = brak wyboru, nie literówka |
| 2 | rekord A w OVH zakładany ręcznie przed akceptacją | zakładany przez `NodeDnsService`, tak jak glue NS |
| 3 | `approveServer` sprawdza tylko kształt hostname | sprawdza, czy A wskazuje na IP z handshake'u |
| 4 | `PENDING_APPROVAL → ACTIVE` wyłącznie kliknięciem | automatycznie, gdy wszystkie sygnały żywe; klik zostaje jako obejście |
| 5 | 6 z 8 checkboxów odhaczanych „na słowo honoru" | każdy krok ma sygnał albo znika |
| 6 | pojemność (CPU/RAM/dysk) ustalana raz, w handshake | odświeżana heartbeatem — schemat już to obiecuje w komentarzu i nie dowozi |
| 7 | wildcard TLS bez `VERRIS_TLS_DEPLOY_WEBHOOK` = wpis w audycie i cisza | zadanie w kolejce agenta, z widocznym stanem |
| 8 | brak `/etc/verris-backup.conf` → backup offsite nie startuje, tylko WARN | konfiguracja generowana przez instalator; brak = FAIL, nie WARN |
| 9 | `imapsync`/`sshpass` brakujące → WARN | instalowane (EPEL) albo twardy FAIL z powodem |
| 10 | `prod-rollout-node-via-jump.sh` ma zaszyty `NODE_HOST=root@62.238.0.223` | parametr wymagany, brak = błąd |

### Zostaje przy człowieku — i to jest lista zamknięta

1. Instalacja czystego systemu u dostawcy.
2. **Zakup** licencji DA / CloudLinux / LiteSpeed (wklejenie kluczy automatyzujemy, zakupu nie).
3. rDNS / PTR w panelu dostawcy.
4. Porty w firewallu dostawcy: 22, 2222, 80/443, 25/465/587/993/995, 53.
5. Glue NS u rejestratora, jeśli marka NS jest spoza OVH.

Kreator ma te pięć rzeczy **wykrywać i weryfikować**, a nie tylko o nich przypominać: sprawdzić
PTR, przeskanować porty, odpytać rejestratora. Krok „zrób to u dostawcy" bez weryfikacji jest
tym samym, co checkbox na słowo honoru.

## Defekty do naprawienia po drodze

**`main()` nie sprawdza kodów powrotu.** W `node-onboard-live.sh` i `node-live-readiness.sh`
funkcje kończą się `return 1`, ale `main` leci dalej i dopiero na końcu drukuje `[FAIL]`.
Skrypt kontynuuje instalację po nieudanym preflighcie. To ta sama rodzina co `--strict`
(`SEC-01`): kontrola, która wykrywa problem i nie zatrzymuje procesu.

**`OFFLINE` nie jest ustawiany nigdy.** Żadna ścieżka w `apps/api/src` nie zapisuje tego
statusu, mimo że `ops-watchdog.scheduler.ts` liczy węzły z przeterminowanym heartbeatem,
a `metrics.service.ts` i `diagnostics.service.ts` raportują „offline". Martwy węzeł zostaje
`ACTIVE` w bazie, po której wybiera `NodeSelector`. **To jest `OPS-01` i to jest przyczyna,
nie objaw.**

**Krok 5 jest jedynym miejscem, gdzie widać błąd.** Stan `error` renderuje się wyłącznie
w kroku „bootstrap". Awaria w kroku 3 nie ma gdzie się pokazać. Dodatkowo przy błędzie
generowania skryptu wizard i tak przechodzi dalej, zostawiając w bazie węzeł `INIT` bez skryptu
— bez retry i bez sprzątania.

**`node-stack-preflight.sh` nie jest wołany przez nic.** Istnieje tylko jako blok do skopiowania.

**`ops/` nie ma `README`.** 80 skryptów bez indeksu, dwa runbooki mówiące co innego.

## Etapy

1. **Rozstrzygnięcie ścieżki** — decyzja v2, aktualizacja obu runbooków, oznaczenie
   `node-onboard-live.sh` jako narzędzia awaryjnego w jego własnym nagłówku.
2. **`OPS-01`** — automatyczne przejście do `OFFLINE` + `NodeSelector` przestaje wybierać
   martwe węzły. Osobno, bo naprawia dzisiejsze zachowanie produktu.
3. **Kody powrotu** w obu skryptach + strażnik, że `main` sprawdza wyniki kroków.
4. **Wizard przepisany na v2** — jedna ścieżka, żywy postęp faz zamiast checkboxów.
5. **Weryfikacja warunków u dostawcy** — PTR, porty, DNS, glue.
6. **Automatyczne `ACTIVE`** — dopiero po 2 i 5, bo bez nich automat zatwierdzałby węzeł
   na podstawie sygnałów, które potrafią kłamać.

Kolejność jest wiążąca: punkt 6 przed punktem 2 oznaczałby automatyczne wpuszczanie do puli
węzłów, których stan potrafi być nieprawdziwy.

## Czego to świadomie nie obejmuje

- **Zakupu licencji i zasobów u dostawcy** — poza zasięgiem.
- **Instalacji systemu operacyjnego** — zakładamy czysty AlmaLinux.
- **Odzyskiwania po awarii w połowie instalacji na poziomie systemu** — v2 jest wznawialny
  fazami, ale nie cofa zmian już wprowadzonych; rollback to osobne zadanie.
- **Migracji istniejących węzłów na nową ścieżkę** — dotyczy tylko nowych.

## Otwarte pytania

1. **Czy licencje mogą leżeć w bazie control-plane?** v2 już to robi, stary wizard obiecuje,
   że nie. Jedna z tych dwóch rzeczy musi przestać być prawdą.
2. **Czy `ACTIVE` ma być automatyczne, czy zostaje decyzją człowieka?** Automat jest szybszy;
   klik jest miejscem, w którym ktoś patrzy na węzeł ostatni raz przed wpuszczeniem klientów.
3. **Co z węzłem, który przeszedł instalację, ale oblał weryfikację u dostawcy** (np. brak PTR)
   — `PENDING_APPROVAL` bezterminowo czy nowy stan?
