# Zewnętrzny monitoring uptime — S-7

Niezależny od własnej infry monitoring dostępności + alert „na człowieka" (SMS/telefon).
Skonfiguruj w SaaS (**Better Stack / UptimeRobot / Pingdom**) LUB uruchom nasz
`synthetic-check.sh` z niezależnego hosta (cron). SaaS jest zalecany dla alertu SMS/telefon.

## Monitory do skonfigurowania (SaaS)

| Nazwa | URL | Metoda | Oczekiwane | Interwał | Alert |
|-------|-----|--------|-----------|----------|-------|
| API readyz | `https://api.verris.pl/readyz` | GET | 200, treść „ok"/JSON ready | 30 s | SMS + e-mail |
| API healthz | `https://api.verris.pl/healthz` | GET | 200 | 60 s | e-mail |
| Panel klienta | `https://panel.verris.pl` | GET | 200/redirect do /login | 60 s | e-mail |
| Status page | `https://status.verris.pl` | GET | 200 | 60 s | e-mail |
| Login (keyword) | `https://api.verris.pl/auth/login` | POST `{"email":"probe@x","password":"x"}` | **401** (nie 5xx) | 5 min | SMS |
| Certyfikat TLS | api/panel/status | TLS expiry | > 14 dni do wygaśnięcia | 1 dz. | e-mail |

## Zasady alertowania
- **On-call:** min. jeden kanał SMS/telefon dla API readyz i login (twarde ścieżki).
- **Eskalacja:** po 2 nieudanych próbach → alert; po 5 min bez potwierdzenia → eskalacja.
- **Utrzymanie:** monitory NIE mogą działać na tej samej infrze co Verris (niezależność).

## Alternatywa self-hosted
`ops/uptime/synthetic-check.sh` — uruchom z zewnętrznego VPS (inny dostawca!) w cronie:
```
* * * * * /opt/verris-uptime/synthetic-check.sh >> /var/log/verris-uptime.log 2>&1
```
Wysyła alert na `UPTIME_WEBHOOK_URL` (Slack/Discord/generic) przy błędzie. To NIE zastępuje
SaaS z SMS, ale daje niezależny drugi sygnał.
