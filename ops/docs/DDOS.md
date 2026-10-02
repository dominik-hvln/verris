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

Dokumentacja LiteSpeed („DDoS Attack Protection”): WebAdmin → **Configuration → Server → Security → Per-Client Throttling**
(`<security><perClientConnLimit>` w `/usr/local/lsws/conf/httpd_config.xml`). **Ustawia to profil węzła**
(`configure_litespeed_throttling` w `node-hosting-profile.sh`) — nie klikamy w WebAdmin, bo ręczna zmiana nie przeszłaby na kolejny węzeł.

| Ustawienie | Przykład z dokumentacji | U nas (decyzja D3 02.10) | Zmienna profilu |
|---|---|---|---|
| Static Requests/second | 40 | 0 (bez limitu — statyki obsługuje tanio LSWS/cache) | `VERRIS_LSWS_STATIC_RPS` |
| Dynamic Requests/second | 2 | 20 | `VERRIS_LSWS_DYN_RPS` |
| Connection Soft Limit | 15 | 100 | `VERRIS_LSWS_SOFT` |
| Connection Hard Limit | 20 | 150 | `VERRIS_LSWS_HARD` |
| Grace Period (sec) | 15 | 15 | `VERRIS_LSWS_GRACE` |
| Banned Period (sec) | 60 | 60 | `VERRIS_LSWS_BAN` |

Dlaczego luźniej niż przykład: ta sama dokumentacja ostrzega, że przy niskich limitach blokowani są prawdziwi
użytkownicy za wspólnym adresem (CDN, biuro za NAT), a 2 zapytania PHP/s z jednego IP to mniej, niż robi sklep z AJAX.
20/s nadal tnie zalew z jednego adresu z tysięcy do 20. Po tygodniu ruchu sprawdzić w logach LiteSpeed odrzucenia
i w razie potrzeby skorygować zmienną w env profilu.
Dodatkowo z tej samej dokumentacji: **reCAPTCHA na poziomie serwera** (LSWS 5.4+) jako tryb awaryjny w czasie ataku.

## W czasie ataku

1. Sprawdź, czy ruch dochodzi do węzła (Grafana: ruch sieciowy, połączenia LiteSpeed). Atak L3/L4 filtruje Hetzner — zwykle nie widać go na serwerze.
2. Atak L7 na jedną stronę: włącz reCAPTCHA serwera w LiteSpeed albo zablokuj źródła (Denied List); jeśli strona ciągnie cały węzeł — tymczasowe zawieszenie usługi z panelu admina (A-25) i kontakt z klientem.
3. Zgłoszenie i komunikat: status.verris.pl (incydent ręczny), kredyty SLA liczą się automatycznie z sond.
