# `X-41` — Zabezpieczenie egressu, które nigdy nie widziało aplikacji

**Status:** etap 1 (obserwacja) gotowy. Etap 2 (egzekwowanie) — dopiero po odczycie.
**Rodowód:** znalezione przypadkiem 2026-08-25, przy diagnozie X-37.

---

## Co się okazało

Cały hardening egressu z X-36 — `VERRIS_ANTISCAN`, `VERRIS_EGRESS_BOGON`,
`VERRIS_EGRESS_STRICT` — wisi w łańcuchu **OUTPUT**:

```
-A OUTPUT -j VERRIS_EGRESS_BOGON
-A OUTPUT -j VERRIS_IOC_DROP
-A OUTPUT -j VERRIS_ANTISCAN
-A OUTPUT -j VERRIS_EGRESS_LOG
-A OUTPUT -j VERRIS_EGRESS_STRICT
```

OUTPUT dotyczy pakietów tworzonych **lokalnie przez host**: dockerd, certbot,
rspamd, unattended-upgrades. Ruch kontenerów przechodzi przez **FORWARD →
DOCKER-USER → DOCKER-FORWARD**, gdzie `DOCKER-USER` jest pusty, a polityka
FORWARD to ACCEPT.

**Egress całego produktu jest poza zasięgiem zabezpieczenia, które wygląda,
jakby go obejmowało.**

## Jak to wyszło

Nie szukaliśmy tego. Przy awarii panelu klienta (X-37) firewall był głównym
podejrzanym, więc Dominik wypiął `VERRIS_ANTISCAN` z OUTPUT. Objaw nie
drgnął — i to była pierwsza wskazówka, choć wtedy odczytałem ją tylko jako
„firewall niewinny". Dopiero pełny `iptables -S` pokazał dlaczego: łańcuch
nigdy nie widział tego ruchu.

To jest ta sama rodzina co X-35 i X-36: **kontrola, która raportuje, że działa,
i nie sprawdza tego, co miała sprawdzać.** Przy X-35 reguła nie umiała
powiedzieć „jest dobrze". Przy X-36 skrypt padał w połowie od czerwca. Tutaj
łańcuch jest kompletny, poprawny i wpięty — tylko nie tam, gdzie płynie ruch.

## Dlaczego NIE naprawiam tego jednym ruchem

Wpięcie istniejących łańcuchów w `DOCKER-USER` to jedna linia i dwie miny:

**1. BOGON zabiłby ruch między kontenerami.** `VERRIS_EGRESS_BOGON` odrzuca
nowe połączenia do `172.16.0.0/12` na portach 80/443. W OUTPUT to nieszkodliwe.
W FORWARD dotyczyłoby **kontenerów rozmawiających ze sobą** — nasze sieci
Dockera to `172.18–172.20`. Dziś przypadkiem by przeszło, bo panele słuchają na
3000/3001/3002, a nie na 80/443. Pierwszy kontener wystawiony na 80 wewnątrz
sieci i mamy awarię bez śladu w logach aplikacji.

**2. Próg anty-skanu opisuje inne wiadro.** 40 nowych połączeń na 60 s dobrano,
gdy `--rsource` w OUTPUT zliczał **cały host jako jedno źródło**. W FORWARD
źródłem jest adres kontenera, więc wiadro jest per kontener. Nikt nie zmierzył,
ile połączeń API otwiera legalnie w piku — rejestrator, Stripe, NBP, węzeł,
proxy fontów. Przeniesienie liczby dobranej do innego wiadra to zgadywanie
udające konfigurację.

Dziś dwa razy wywróciłem wdrożenie, bo wysłałem coś niezmierzonego. Trzeci raz
w tym samym dniu, na regułach firewalla produkcyjnego, byłby wyborem, nie
pechem.

## Etap 1 — obserwacja

Nowy tryb `--obserwuj-kontenery` wpina do `DOCKER-USER` łańcuch
`VERRIS_FWD_OBSERW`, który **nie zawiera ani jednej reguły DROP ani REJECT**:

```
-m conntrack --ctstate RELATED,ESTABLISHED   -j RETURN   # odpowiedzi, nie egress
-o docker0                                    -j RETURN   # ruch DO kontenera
-o br-+                                       -j RETURN   # j.w., wszystkie mostki
-m set --match-set verris_egress_https dst    -j RETURN   # cele już zaufane
-p tcp --dports 80,443 --ctstate NEW -m limit … -j LOG --log-prefix "VERRIS-FWD-KANDYDAT "
-j RETURN
```

Kolejność nie jest kosmetyczna. Bez `-o br-+` przed regułą logującą inwentarz
zawierałby ruch kontener→kontener, który egressem nie jest — i progi etapu 2
oparłyby się na śmieciach.

Odczyt: `ops/scripts/security-egress-kandydaci.sh` — grupuje wpisy wg celu
(z nazwą odwrotną) i wg kontenera (z nazwą z `docker inspect`), a na końcu
podaje **szczyt nowych połączeń w jednej minucie per kontener**. To jest ta
jedna liczba, która ma prawo wyznaczyć próg w etapie 2.

## Strażnik

`apps/api/src/test/obserwacja-nie-blokuje.spec.ts` — sześć asercji. Pilnuje, że
łańcuch obserwacji nie zawiera DROP/REJECT, że zwolnienia ruchu do kontenerów
stoją **przed** regułą logującą, że wpina się w `DOCKER-USER`, a nie w OUTPUT,
i że tryb jest wyłączny (wychodzi przed `apply_ioc_drop`).

Czyta ciało funkcji **po wycięciu komentarzy** — proza opisująca defekt cytuje
reguły, których zabrania. Piąty raz w tym repo.

## Czego ten etap NIE robi

- **Niczego nie blokuje.** Dziura w hardeningu pozostaje otwarta przez cały
  czas obserwacji. To świadomy wybór: otwarta i zmierzona jest lepsza niż
  zamknięta na oślep i wywracająca produkcję.
- **Nie obejmuje UDP ani portów innych niż 80/443.** DNS, SMTP i wszystko
  poza HTTP(S) zostaje niepoliczone. Etap 2 musi zdecydować, czy to zakres,
  czy kolejna dziura.
- **Nie mierzy ruchu wychodzącego z hosta** — ten jest pokryty przez X-36
  i widać go w `VERRIS-EGRESS-WEB`.
- **Limiter `5/s burst 100` gubi pakiety przy zalewie.** Inwentarz celów będzie
  kompletny, sumy — nie. Do wyznaczenia progu to wystarczy, do rozliczenia
  incydentu nie.

## Znalezisko poboczne: allowlista nie pokrywa Stripe

Sprawdzone 2026-08-25 na produkcji:

```
api.stripe.com   198.137.150.21   BRAK
api.stripe.com   198.202.176.21   BRAK
(minutę wcześniej ten sam host wskazywał 198.202.176.221)
```

`api.stripe.com` **jest** w `egress-allow-hostnames.txt`, ale zbiór buduje
`getent` w jednej chwili, a Stripe rotuje adresy w co najmniej dwóch pulach.
To dokładnie ta usterka, którą X-36 opisało dla `ghcr.io` i rozwiązało wpisem
CIDR z RDAP.

**Konsekwencja jest poważniejsza niż niedziałający deploy: gdyby `--strict`
kiedykolwiek dostał regułę DROP, przestałyby działać płatności** — a
dowiedzielibyśmy się o tym od klienta, nie z monitoringu. Rozwiązaniem jest
wpis zakresów do `egress-allow-nets.txt`, ale **wyłącznie po potwierdzeniu
w rejestrze**, zgodnie z zasadą zapisaną w nagłówku tego pliku. Nie wpisuję
ich dziś, bo nie mam potwierdzenia.

## Do backlogu

1. **Etap 2 X-41** — egzekwowanie, po odczycie inwentarza.
2. **Zakresy Stripe w `egress-allow-nets.txt`** — po weryfikacji w RDAP.
3. **`--strict` nadal nie ma reguły DROP** (`VERRIS_EGRESS_STRICT` to dwa
   `RETURN`). Zanim ją dostanie, punkt 2 musi być zamknięty.
4. **Egress poza 80/443** — UDP/53, SMTP, reszta.
