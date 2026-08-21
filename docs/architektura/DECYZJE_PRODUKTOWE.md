# Decyzje produktowe (utrwalone)

<!-- Uratowane z PROJECT_STATUS.md przy porządkowaniu repo 2026-08-21.
     Reszta tamtego dokumentu trafiła do docs/archiwum/ jako nieaktualna. -->

> **Kolumna „Stan" pochodzi z czerwca 2026 i nie jest już wiarygodna** — audyt parytetu z 2026-08-20
> obalił część tych statusów. Wartość tego dokumentu leży w **kolumnie decyzji**, nie w stanie wykonania.
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`.

| Decyzja                                                                                             | Stan                                                                                               |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Silnik hostingowy: **CloudLinux + LiteSpeed + DirectAdmin po API** (interfejs 100% nasz)            | AGREED                                                                                             |
| Płatności: **Stripe na start** (karty + P24/BLIK przez Stripe), **PayU jako drugi gateway później** | AGREED — Stripe Checkout zaimplementowany; subskrypcje Stripe TODO                                 |
| Model rozliczeń: **subskrypcja**, dodatkowo **portfel** (autoscaling i pojedyncze opłaty)           | AGREED — portfel + ledger gotowy                                                                   |
| Autoscaling realne przez **CloudLinux LVE** (limity przez DirectAdmin: `ep` / `nproc`)              | AGREED — silnik + billing + push limitów; plany: `entryProcesses` + `nprocLimit` (NPROC > EP + 15) |
| Węzły dodawane przez **panel admina + skrypt bootstrap** (jednorazowy token, akceptacja w panelu)   | DONE                                                                                               |
| Architektura: **1 mały serwer control‑plane** (panel + DB) + **N węzłów** (klienci)                 | AGREED — control‑plane przez `docker-compose.prod.yml`; węzły dodajemy ręcznie                     |
| Bezpieczeństwo paneli: **3 osobne aplikacje** (porty 3001/3002/3003), niezależne sesje              | DONE                                                                                               |
| Tryb EKO: punkty + drzewo + zielony badge HTML                                                      | AGREED — implementacja w etapie G                                                                  |
