# Verris — Decyzja Zakresu Oferty Na Start LIVE

> Ten dokument rozstrzyga, które elementy są blockerem startu oferty LIVE, a które mogą być wyłączone, ukryte albo niekomunikowane w ofercie startowej. Zasada nadrzędna: brak MVP i brak pozornych funkcji. Jeśli czegoś nie ma w 100% end-to-end, nie pokazujemy tego klientowi jako dostępne.

## Blockery Oferty Startowej

Te elementy muszą być gotowe, przetestowane i opisane w smoke teście przed wpuszczeniem pierwszego klienta zewnętrznego:

- Rejestracja, logowanie, 2FA, zgody prawne i re-consent.
- Zakup hostingu z realnym billingiem (`WALLET` i/lub Stripe, zależnie od skonfigurowanej oferty).
- Provisioning konta DirectAdmin z widocznym statusem klienta.
- Podstawowe narzędzia hostingu przez DirectAdmin: DNS, mail, FTP, SSL, cron, backupy, file manager/link do DA.
- Portfel, faktury, historia płatności i powiadomienia transakcyjne.
- Tickety klienta i panel staff z profilem 360, timeline, diagnostyką oraz audytem działań.
- Admin/NOC: węzły, plany, klienci, provisioning queue, status page, capacity/anomaly, audit log.
- Monitoring, backup/restore, metryki, alerty, incident/status workflow.
- Dokumenty prawne bez placeholderów i zaakceptowane do publikacji.

## Nie Blokują Startu, Jeśli Nie Są Komunikowane Jako Dostępne

Te elementy nie blokują kontrolowanego startu LIVE, pod warunkiem że nie występują w ofercie, menu lub komunikacji sprzedażowej jako gotowe:

- **PayU/BLIK (`C-13`)** — Stripe może być jedynym gatewayem startowym, jeśli oferta mówi jasno „płatności kartą/Stripe i portfel”.
- **IAM/subkonta klienta (`E-12/R-12`)** — **decyzja 2026-06-01: P0 dla wszystkich.** IAM jest standardowym elementem panelu (nie opcją), zgodnie z `HOSTING_LAUNCH` D-1. Moduł jest wdrożony i widoczny dla każdego klienta.
- **Rejestracja/transfer domen (`R-13`)** — nie blokuje, jeśli Verris komunikuje „podłącz własną domenę”, nie „kup domenę u nas”.
- **Softaculous/WP installer (`R-15`)** — nie blokuje, jeśli w panelu nie obiecujemy 1-click installera.
- **AWStats/Webalizer/statystyki ruchu (`R-19`)** — nie blokuje, jeśli usage w panelu dotyczy zasobów LVE, a statystyki ruchu są dostępne przez DA albo nie są komunikowane.
- **Pełny EKO/referral (`R-14`)** — nie blokuje, jeśli EKO nie jest głównym elementem oferty startowej.
- **AI live chat/predykcja (`R-18`)** — nie blokuje i nie powinno być komunikowane jako gotowe przed osobnym produkcyjnym wdrożeniem.

## Wymagane Ukrycie / Komunikacja

- Menu i CTA nie mogą prowadzić do funkcji z listy „nie blokują”, jeśli funkcja nie jest gotowa.
- Jeśli funkcja jest wspomniana w dokumencie marketingowym, musi mieć jasny status „planowane” poza panelem produkcyjnym, nie w ścieżce klienta.
- Feature flags mogą istnieć, ale domyślnie `OFF` dla funkcji niedokończonych.

## Decyzja Rekomendowana

Start LIVE powinien obejmować hosting z DirectAdmin, CloudLinux LVE, billing Stripe/portfel, IAM/subkonta klienta (P0 — decyzja 2026-06-01), BOK/staff/admin/NOC, compliance i status page. PayU, rejestrator domen, Softaculous, statystyki ruchu, EKO/referral i AI traktujemy jako osobne sprinty produktowe po potwierdzeniu stabilności core hostingu.
