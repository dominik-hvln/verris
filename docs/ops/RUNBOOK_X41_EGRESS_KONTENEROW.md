# X-41 — włączenie blokady egressu kontenerów na control-plane (runbook)

Dla: Dominik, SSH jako root na control-plane (Panel), katalog `/opt/verris`.
Stan wyjściowy (12.10.2026): strict hosta (OUTPUT, SEC-01) włączony 06.10; kontenery (DOCKER-USER)
w trybie **pomiar** od ~07.10 16:10 (wg przekazania) — tylko LOG, zero DROP.

## Co dokładnie zostanie zablokowane

Blokada kontenerów **nie jest allowlistą domen** (decyzja 06.10: API łączy się z dowolnymi hostami
klientów — monitoring stron, migrator, webhooki; na 80/443 pilnują strażniki SSRF w aplikacji).
`--kontenery-egzekwuj` dokłada w `DOCKER-USER` łańcuch `VERRIS_FWD_EGZEKW`, per kontener:

| Reguła | Próg (domyślny) | Prefiks logu |
|---|---|---|
| IOC (`/etc/verris/security/ioc-ips.txt`, ta sama lista co host) | każde połączenie | `VERRIS-FWD-IOC` |
| Nowe połączenia SMTP (25/465/587) | > 60/min, zapas 120 | `VERRIS-FWD-SMTP` |
| Nowe połączenia (każdy port/protokół, także DNS) | > 20/s, zapas 1000 | `VERRIS-FWD-SKAN` |

Bez zmian: sieć danych `verris_internal` bez internetu, REJECT metadanych chmury (SEC-09), obserwacja
`VERRIS_FWD_OBSERW`. Paynow, KSeF, Stripe, Hetzner, OpenProvider, OVH, Turnstile, OpenAI/Anthropic,
Wordfence, węzły (DA :2222, SSH) — dalej osiągalne z kontenerów, dopóki mieszczą się w limitach tempa.
Poczta transakcyjna idzie przez Postfix hosta (domyślnie `SMTP_HOST=host.docker.internal:25` →
INPUT, nie FORWARD), więc limit SMTP jej nie dotyczy — potwierdź: `grep -E '^SMTP_HOST=' /opt/verris/.env.prod` (brak albo `host.docker.internal`)
i `grep -cE '^EMM_SMTP_URL=.+' /opt/verris/.env.prod` (`0` = kampanie wyłączone; bez wypisywania — w adresie jest hasło).

Skrypt sam odmówi włączenia (kod 1), jeśli: pomiar trwa < 48 h, log pomiaru ma trafienia
`VERRIS-FWD-SKAN`/`VERRIS-FWD-SMTP`, nie ma skąd czytać logu jądra albo `FORWARD` nie skacze
do `DOCKER-USER` (Docker z backendem nftables ignoruje `DOCKER-USER` —
https://docs.docker.com/engine/network/firewall-nftables/, „Migrating DOCKER-USER”).

## 0. Wersja skryptu na hoście

Raport i bramka trafień są od commita z tego runbooka. Sprawdź:

```bash
cd /opt/verris
git log -1 --oneline -- ops/scripts/security-control-plane-egress.sh
sudo bash ops/scripts/security-control-plane-egress.sh --help | grep -c kontenery-raport   # 1 = nowa wersja
```

Starsza wersja też ma `--kontenery-egzekwuj` / `--kontenery-pomiar` / `--kontenery-wylacz`, ale bez
raportu i bez sprawdzania trafień — wtedy krok 2 zrób ręcznie poleceniem `journalctl` z kroku 2b.

## 1. Odczyt stanu (tylko odczyt)

```bash
cat /etc/verris/security/egress-tryb                 # strict  (host, SEC-01)
cat /etc/verris/security/egress-kontenery-tryb       # pomiar  (kontenery, X-41)
date -u -d @"$(cat /etc/verris/security/egress-kontenery-egzekw-od)"   # od kiedy pomiar kontenerów
sudo iptables -S FORWARD | grep DOCKER-USER          # -A FORWARD -j DOCKER-USER  (musi być)
sudo iptables -S DOCKER-USER                         # VERRIS_FWD_EGZEKW, VERRIS_FWD_METADANE, VERRIS_FWD_OBSERW
sudo iptables -S VERRIS_FWD_SKAN; sudo iptables -S VERRIS_FWD_SMTP   # w pomiarze: tylko LOG, bez DROP
systemctl is-enabled verris-egress; systemctl is-active verris-egress   # enabled / active
docker info --format '{{.ServerVersion}}'; grep -s firewall-backend /etc/docker/daemon.json   # brak = iptables
```

Jeśli `egress-kontenery-tryb` nie istnieje — pomiar nie ruszył: `sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-pomiar`
i wróć po 48 h.

## 2. Logi odmów z okresu pomiaru

### 2a. Raport (nowa wersja skryptu)

```bash
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-raport                  # od początku pomiaru
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-raport --od '48 hours ago'
```

Raport pokazuje: tryb, datę pomiaru, wpięcie łańcucha, liczbę wpisów `VERRIS-FWD-SKAN/SMTP/IOC`,
podział wg kontenera (nazwa z bieżącego `docker inspect`) i celu, dokładne liczniki iptables
(od ostatniego zbudowania łańcucha) i **WERDYKT**. Oczekiwane: „limit SMTP i limit tempa nie
odcięłyby w tym oknie niczego”, `VERRIS-FWD-IOC : 0`.

### 2b. Ręcznie (działa też ze starym skryptem)

`-k` w journalctl oznacza tylko bieżący rozruch — dlatego `_TRANSPORT=kernel`:

```bash
sudo journalctl _TRANSPORT=kernel --since "2026-10-07 16:00" --no-pager -q \
  | grep -E 'VERRIS-FWD-(IOC|SMTP|SKAN) ' | awk '{for(i=1;i<=NF;i++) if($i ~ /^(VERRIS-FWD|SRC=|DST=|DPT=)/) printf "%s ", $i; print ""}' \
  | sort | uniq -c | sort -rn | head -30
sudo iptables -L VERRIS_FWD_EGZEKW -v -n -x    # pkts przy regułach hashlimit = pakiety ponad limit
```

Pusto = egzekwowanie nie odcięłoby niczego, co kontenery robiły w tym czasie.

**Jeśli są trafienia:** sprawdź kontener (`docker inspect` po SRC). Legalny ruch (np. fala monitoringu,
synchronizacja z węzłem) → podnieś próg przy ponownym pomiarze, np.
`sudo FWD_NOWE_LIMIT=40/sec bash ops/scripts/security-control-plane-egress.sh --kontenery-pomiar`
(uwaga: progi nie są zapisywane — przy restarcie hosta wracają domyślne; trwała zmiana = zmiana
domyślnej wartości w skrypcie). Ruch niechciany → świadomie `--kontenery-wymus-egzekwuj`.
Trafienie IOC = potencjalny incydent (docs/ops/INCIDENT_RESPONSE.md), nie blokuje włączenia.

## 3. Włączenie blokady

```bash
cd /opt/verris
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-egzekwuj
```

Oczekiwane w wyjściu: `Pomiar kontenerów: N d`, `zero trafień limitów…`,
`Kontenery (DOCKER-USER, tryb egzekwuj): … → LOG + DROP`. Kod 1 = odmowa z powodem; nic nie
zostało zmienione.

## 4. Weryfikacja (od razu po włączeniu)

```bash
cat /etc/verris/security/egress-kontenery-tryb                       # egzekwuj
sudo iptables -S VERRIS_FWD_SKAN | grep -- '-j DROP'                 # verris-fwd-skan
sudo iptables -S VERRIS_FWD_SMTP | grep -- '-j DROP'                 # verris-fwd-smtp
sudo iptables -S VERRIS_FWD_EGZEKW | grep verris-fwd-ioc             # DROP dla każdego adresu IOC
sudo iptables -S DOCKER-USER | grep VERRIS_FWD_EGZEKW                # wpięty
```

**Dozwolone hosty z kontenera API** (każdy URL ma dać kod HTTP — 200/301/401/404 są OK; `BŁĄD` = problem):

```bash
docker exec verris-api-1 node -e "for (const u of ['https://api.paynow.pl','https://api.stripe.com/v1','https://api.ksef.mf.gov.pl','https://challenges.cloudflare.com/turnstile/v0/siteverify','https://api.hetzner.cloud/v1','https://api.openprovider.eu','https://api.nbp.pl/api/exchangerates/tables/a/last/?format=json']) fetch(u,{signal:AbortSignal.timeout(10000)}).then(r=>console.log(r.status,u)).catch(e=>console.log('BŁĄD',e.cause?.code??e.name,u))"
```

**Niedozwolony cel** (metadane chmury, SEC-09 — oczekiwane `ECONNREFUSED` natychmiast):

```bash
docker exec verris-api-1 node -e "fetch('http://169.254.169.254/hetzner/v1/metadata/hostname',{signal:AbortSignal.timeout(5000)}).then(r=>console.log('DOSTĘP — ŹLE',r.status)).catch(e=>console.log('odcięte:',e.cause?.code??e.name))"
```

Nie testuj połączeniem do adresu z listy IOC — to sinkhole z incydentu Hetzner 01.06; gdyby blokada
nie działała, wygenerowałbyś dokładnie ten sygnał nadużycia. Obecność reguł IOC sprawdza `iptables -S` wyżej.

**Limit tempa naprawdę odrzuca (opcjonalnie, ~1 min)** — w osobnym, jednorazowym kontenerze
(własny licznik, API nietknięte); 1300 połączeń do jednego hosta, nie skan:

```bash
docker run --rm node:22-alpine node -e "const net=require('net');let ok=0,zle=0;const jeden=()=>new Promise(r=>{const s=net.connect(443,'1.1.1.1');s.setTimeout(3000,()=>{zle++;s.destroy();r()});s.on('connect',()=>{ok++;s.destroy();r()});s.on('error',()=>{zle++;r()})});(async()=>{for(let i=0;i<26;i++)await Promise.all(Array.from({length:50},jeden));console.log('połączone',ok,'odcięte/timeout',zle)})()"
sudo iptables -L VERRIS_FWD_SKAN -v -n -x        # pkts przy DROP > 0
sudo journalctl _TRANSPORT=kernel --since '-5min' -q | grep -c 'VERRIS-FWD-SKAN '
```

Oczekiwane: `połączone` ≈ 1000 + kilkadziesiąt, `odcięte/timeout` > 0. Uwaga: te wpisy SKAN
zostają w logu — jeśli później wrócisz do pomiaru i włączysz ponownie, bramka je zobaczy
(wtedy świadomie `--kontenery-wymus-egzekwuj`).

**Ścieżki biznesowe bez prawdziwych pieniędzy:**
- Płatności: połączenie z Paynow/Stripe sprawdza test wyżej (401/404 bez podpisu = sieć działa).
  Powiadomienia Paynow przychodzą do nas (ruch WCHODZĄCY do kontenera — `-o br-+ RETURN`, nie
  podlega limitom). Pełny zakup testowy — 18.10 wg planu (t1 przyjmuje konta).
- Mail: panel klienta → „Nie pamiętam hasła” dla `dominik@dkowalski.pl` → mail dochodzi
  (idzie przez Postfix hosta; test potwierdza, że nic po drodze nie zostało ruszone).
- Węzeł: admin → Węzły → t1 → „Usługi i logi” → „Sprawdź na serwerze” (DA :2222 / SSH z API).
- Logowanie do panelu klienta z Turnstile (weryfikacja captcha idzie z API).
- Po 15–30 min: `sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-raport --od '-30min'`
  → `VERRIS-FWD-SKAN/SMTP : 0`; `docker logs --since 30m verris-api-1 2>&1 | grep -cE 'EAI_AGAIN|ETIMEDOUT|ECONNRESET'`
  ma być na poziomie sprzed włączenia.

## 5. Powrót (jedna komenda)

```bash
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-pomiar    # z powrotem tylko LOG (zalecane)
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-wylacz    # całkowicie wypina łańcuchy kontenerów
```

Obie komendy od razu utrwalają stan (`netfilter-persistent save` + `egress-kontenery-tryb`), więc
restart hosta nie przywróci blokady.

## 6. Restart Dockera i hosta

- **Restart hosta:** `verris-egress.service` (`--przy-starcie`, po `docker.service`) odtwarza tryb
  z `egress-kontenery-tryb`. Po najbliższym restarcie: kroki z punktu 4 (`iptables -S …`) i
  `journalctl -u verris-egress -b`. Gdy Docker nie wstał przed usługą, w logu jest
  `WARN: … tryb kontenerów (egzekwuj) NIEodtworzony` — wtedy `sudo systemctl restart verris-egress`.
- **Restart samego Dockera:** dokumentacja Dockera opisuje `DOCKER-USER` jako miejsce na reguły
  użytkownika i obiecuje skok z `FORWARD` (https://docs.docker.com/engine/network/firewall-iptables/),
  ale nie mówi wprost, że zawartość łańcucha przetrwa restart demona (wg kodu moby łańcuch jest
  tworzony tylko, gdy go brak — nie czyszczony). Po każdym `systemctl restart docker` sprawdź
  `sudo iptables -S DOCKER-USER | grep VERRIS_FWD_EGZEKW`; brak → `sudo systemctl restart verris-egress`.
- **Zmiana backendu Dockera na nftables** (`firewall-backend` w daemon.json) wyłącza całe X-41 po
  cichu — skrypt odmówi i raport pokaże `Skok FORWARD → DOCKER-USER: BRAK`.

## 7. Co może przestać działać (na co patrzeć po włączeniu)

- **Fala nowych połączeń z API ponad 20/s po wyczerpaniu zapasu 1000** — DROP SYN-a = opóźnienie
  (retransmisja po 1–3 s), DROP zapytania DNS = `EAI_AGAIN`. Źródła w kodzie: klient DA bez
  keep-alive (`libs/directadmin-sdk/src/client.ts:270` — każde wywołanie to nowe połączenie TCP),
  monitoring stron co minutę po 10 równolegle (`apps/api/src/subscriptions/site-monitor.service.ts:37,564`),
  DNS kontenera przez wbudowany resolver Dockera — jeśli zapytania do resolwerów Hetznera wychodzą
  z przestrzeni sieciowej kontenera, też się liczą; sprawdź: `sudo ipset list verris_egress_seen_fwd | grep ',udp:53'`
  (wpisy = liczą się).
  Przy dzisiejszej skali (beta, jeden węzeł) pomiar to rozstrzyga; przy wzroście — objaw: fałszywe
  „strona nie działa” z monitoringu i `VERRIS-FWD-SKAN` z adresem API.
- **Kampanie e-mail marketingu (EMM)** — gdy po starcie zostanie ustawiony `EMM_SMTP_URL`, wysyłka idzie
  z kontenera API bezpośrednio do zewnętrznego SMTP, jedno połączenie na wiadomość
  (`apps/api/src/mail/smtp-mailer.provider.ts:148,155`), do 100 wiadomości na minutę na kampanię
  (`email-marketing.dispatcher.ts:19`, `BATCH_SIZE` w `email-marketing.service.ts:85`). Limit 60/min
  zwolni ją do ~60 połączeń/min po zapasie 120. Przed włączeniem EMM: pomiar albo `FWD_SMTP_LIMIT`.
- **Kontenery jednorazowe przy wdrożeniu** (`docker compose run`, migracje) mają własny licznik — nie
  dzielą zapasu z API.

## 8. Poza X-41 (znalezione przy przeglądzie, nie zmieniane)

- Strict hosta (OUTPUT) nie przepuści `api.ipify.org` — `ops/scripts/vpn-wireguard-setup.sh:72` wypisze
  wtedy `<public-ip>` zamiast adresu (wpisz IP ręcznie przy konfiguracji VPN). `ops/scripts/ksef-smoke.ts`
  (środowisko testowe MF) uruchamiany na hoście też zostanie odcięty — uruchamiać poza control-plane
  albo z kontenera.
- Kopia off-site (`ops/backup-mirror-external.sh`) działa w kontenerze `minio-bootstrap`, który jest tylko
  w sieci `verris_internal` (`internal: true`) — po włączeniu `MIRROR_EXTERNAL_ENABLED=1` nie dosięgnie
  zewnętrznego storage niezależnie od X-41.
