# Incydent: wychodzący netscan z control-plane (Hetzner abuse, 2026-06-11)

## Co się stało
Hetzner zgłosił **„Netscan detected from host 204.168.174.138"** (to IP
control-plane Verris). Log pokazuje setki **wychodzących** połączeń SYN
(rozmiar 74 B) do sekwencyjnych adresów `71.248.198.0/24` i `71.248.199.0/24`
na portach **80 i 443**, w oknie ~12:39–12:43 UTC. To klasyczny **skan portów /
sweep zakresu IP** wychodzący z Twojego serwera.

Tempo: dziesiątki połączeń w tej samej sekundzie (np. 12:39:07) → to nie był
pojedynczy proces aplikacji, lecz narzędzie skanujące.

## Najprawdopodobniejsza przyczyna (do potwierdzenia na serwerze)
1. **Skompromitowany proces/kontener** na control-plane (najgroźniejsze) — np.
   przez podatną zależność, wystawiony port, słaby sekret.
2. Złośliwy/zhakowany proces w którymś kontenerze (panel/API) wykorzystany jako
   pivot do skanowania.
3. (Mniej prawdopodobne) ktoś z dostępem SSH uruchomił skaner.

> To NIE jest ruch generowany przez funkcje Verris — monitoring stron (B3)
> odpytuje wyłącznie domenę klienta po HTTPS, nie sekwencyjne zakresy /24.

## NATYCHMIASTOWE działania (uruchom na control-plane jako root)

### 1. Zidentyfikuj źródło — ZANIM cokolwiek ubijesz
```bash
# Aktywne wychodzące połączenia 80/443 z PID i procesem:
ss -tnp state syn-sent '( dport = :80 or dport = :443 )' | head -50
# Rozkład docelowych IP (czy to fan-out do wielu hostów?):
ss -tn state syn-sent | awk '{print $5}' | grep -oE '^[0-9.]+' | sort | uniq -c | sort -rn | head
# Jeśli jest conntrack:
conntrack -L -p tcp 2>/dev/null | grep -E 'dport=(80|443)' | grep -v ESTABLISHED | head -50
# Który kontener? (mapowanie PID → cgroup/docker)
for p in $(ss -tnHp state syn-sent | grep -oE 'pid=[0-9]+' | sed 's/pid=//' | sort -u); do
  echo "PID $p:"; cat /proc/$p/cgroup 2>/dev/null | grep -o 'docker-[0-9a-f]*' | head -1; ps -p $p -o pid,ppid,user,cmd= ; done
```

### 2. Zatrzymaj skan (containment)
```bash
# Twardy limit nowych połączeń WWW (dławi skan, nie zrywa istniejących sesji):
iptables -I OUTPUT 1 -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW \
  -m limit --limit 10/min --limit-burst 20 -j ACCEPT
iptables -I OUTPUT 2 -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j DROP
# (jeśli źródłem jest konkretny kontener — zatrzymaj go:)
# docker stop <nazwa_lub_id>
```

### 3. Wdroż trwałe utwardzenie (z repo)
```bash
cd /opt/verris
# Egress control-plane: IOC-drop + DROP do bogonów/sieci prywatnych + anti-scan
# (po incydencie: 40 nowych poł./60s ORAZ 300/15 min → DROP):
sudo bash ops/scripts/security-control-plane-egress.sh
# Detektor fan-outu (conntrack) co 1 min, z auto-blockiem:
sudo bash ops/scripts/security-outbound-scan-detect.sh --install --block
# (opcjonalnie, najmocniejsze) allowlista hostów — TYLKO po uzupełnieniu
#   /etc/verris/security/egress-allow-hostnames.txt
sudo bash ops/scripts/security-control-plane-egress.sh --strict
```

### 4. Dochodzenie / czy doszło do włamania
```bash
# Świeże/obce pliki, nietypowe procesy, cron, klucze SSH:
sudo bash ops/scripts/security-incident-collect.sh   # zbiera artefakty do analizy
last -50; lastb -50                                   # logowania / nieudane
sudo find / -newermt '2026-06-11 00:00' -type f 2>/dev/null | grep -vE '/(proc|sys|var/log)/' | head -50
crontab -l; for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u "$u" 2>/dev/null; done
grep -r . /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null
docker ps -a; docker images   # nieznane kontenery/obrazy?
```
Jeśli znajdziesz dowody kompromitacji control-plane → potraktuj sekrety jako
spalone: **rotacja** `JWT_SECRET`, `APP_KMS_KEY` (CLI: `cli:rotate-kms`),
`POSTGRES_PASSWORD`, login keys DA, tokeny KSeF/OpenProvider/Stripe.

### 5. Odpowiedz Hetznerowi
Krótko: incydent zidentyfikowany, źródło zablokowane, wdrożono egress
deny-by-default + detektor skanu + (jeśli dotyczy) izolacja/odbudowa
skompromitowanego komponentu. Załącz timestamp i podjęte kroki.

## Co zostało dodane w kodzie (ten commit)
- `security-control-plane-egress.sh` — **DROP do bogonów/sieci prywatnych** na
  80/443, **niższe progi anti-scan** (40/60s) + **druga warstwa wolnego skanu**
  (300/15 min). Wcześniej egress control-plane był opcjonalny i nie wyłapał
  wolnego sweepu.
- `security-outbound-scan-detect.sh` — niezależny od iptables detektor fan-outu
  (conntrack): liczy unikalne publiczne IP docelowe; po przekroczeniu progu
  loguje, **alarmuje API** (`/agent/security/alert`) i z `--block` wstawia
  tymczasowy limit. Instalowany automatycznie na węzłach (`node-onboard-live.sh`).
- API `POST /agent/security/alert` (ServerIdentityGuard) + pola `Server.lastSecurityAlert*`
  + audyt `NODE_SECURITY_ALERT` → alerty floty widoczne w panelu admina.

## Zalecenia trwałe (poza tym commitem)
- **Control-plane egress `--strict`** (allowlista: DNS, repo pakietów, Stripe,
  OpenProvider, KSeF/MF, OVH, SMTP relay, NTP, GitHub deploy, DA :2222 węzłów).
- **Zewnętrzny monitoring** (UptimeRobot/BetterStack) — niezależny od własnej infry.
- **Trivy/Dependabot** na obrazy i zależności (skompromitowana zależność to
  najczęstsza droga do takiego pivotu).
- Rozważ **Cloudflare** przed control-plane (ukrycie origin IP).
