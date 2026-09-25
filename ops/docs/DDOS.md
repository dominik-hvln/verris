# Ochrona przed DDoS (G-21)

Decyzja właściciela 2026-09-25: **na start ochrona Hetznera, Cloudflare przed panelem i verris.pl po starcie.**
Poniżej, co faktycznie chroni każdą warstwę — bez obietnic ponad to, co jest skonfigurowane.

## Warstwy

| Warstwa | Co chroni | Gdzie | Stan |
|---|---|---|---|
| L3/L4 (wolumetryczne i protokołowe: UDP flood, SYN flood, DNS/NTP reflection) | Hetzner DDoS Protection — automatyczne rozpoznawanie wzorców ataku i filtrowanie, **w cenie dla wszystkich klientów** (hetzner.com → Unternehmen → DDoS-Schutz) | sieć Hetznera, przed control-plane i węzłami | działa (nic do włączenia) |
| L7 — API i panele | RateLimitGuard (limity na trasę i IP), blokady logowania, Turnstile na rejestracji/logowaniu | control-plane | działa |
| L7 — strony klientów | LiteSpeed Per-Client Throttling + WAF (ModSecurity/CRS) + LiteSpeed Cache | węzeł | do ustawienia przy onboardingu (niżej) |
| L7 z CDN/proxy | Cloudflare przed panelem i verris.pl | — | **po starcie** |

Hetzner nie opisuje ochrony warstwy aplikacji (L7) — tę część robimy sami.

## Węzeł: LiteSpeed Per-Client Throttling (przy onboardingu)

Dokumentacja LiteSpeed („DDoS Attack Protection”): WebAdmin → **Configuration → Server → Security → Per-Client Throttling**.
Wartości przykładowe z dokumentacji (punkt startowy; korekta po obserwacji ruchu):

| Ustawienie | Wartość |
|---|---|
| Static Requests/second | 40 |
| Dynamic Requests/second | 2 |
| Connection Soft Limit | 15 |
| Connection Hard Limit | 20 |
| Grace Period (sec) | 15 |
| Banned Period (sec) | 60 |
| Block Bad Request | Yes |

Dynamic Requests/second = 2 jest ostre dla sklepów z AJAX — po tygodniu sprawdzić w logach, czy nie banuje prawdziwych
klientów (błędy 503/odrzucenia w logu LiteSpeed), i w razie potrzeby podnieść.
Dodatkowo z tej samej dokumentacji: **reCAPTCHA na poziomie serwera** (LSWS 5.4+) jako tryb awaryjny w czasie ataku.

## W czasie ataku

1. Sprawdź, czy ruch dochodzi do węzła (Grafana: ruch sieciowy, połączenia LiteSpeed). Atak L3/L4 filtruje Hetzner — zwykle nie widać go na serwerze.
2. Atak L7 na jedną stronę: włącz reCAPTCHA serwera w LiteSpeed albo zablokuj źródła (Denied List); jeśli strona ciągnie cały węzeł — tymczasowe zawieszenie usługi z panelu admina (A-25) i kontakt z klientem.
3. Zgłoszenie i komunikat: status.verris.pl (incydent ręczny), kredyty SLA liczą się automatycznie z sond.
