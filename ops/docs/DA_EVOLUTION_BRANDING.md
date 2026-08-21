# DirectAdmin — branding Verris na skinie Evolution (runbook)

> Realizacja fazy 2 z [`DA_CUSTOM_SKIN_ROADMAP.md`](DA_CUSTOM_SKIN_ROADMAP.md) w wariancie
> **branding override na Evolution** — jedynym oficjalnie wspieranym i przeżywającym
> aktualizacje DA (Evolution jest własnościowy, bez źródeł — fork niemożliwy; pełny
> custom skin = legacy architektura Enhanced, odradzana przez dokumentację).
> Zweryfikowano na docs.directadmin.com, stan: 2026-07 (DA 1.703).

## Decyzja architektoniczna

| Warstwa | Mechanizm (udokumentowany) | Przeżywa update? |
|---|---|---|
| Strona logowania | `data/templates/custom/login.html` + `static/` | TAK (docs) |
| Reset hasła | `data/templates/custom/lost_password.html` + `lost_password=1` | TAK (docs) |
| Kolory/CSS panelu | Admin Tools → Customize Evolution Skin (CSS variables + custom CSS) | TAK (docs) |
| Logo/favicon | Customize Evolution Skin → Logos | TAK (docs) |
| Help links | Customize Evolution Skin → Help Links (zamiast evo.site-helper.com) | TAK (docs) |
| Uproszczenie menu | Customize Evolution Skin → Menu Customizations (add/remove/reorder) | TAK (docs) |
| Pozycje menu Verris | plugin `verris_links` (`menu_user=images/menu.json`) | TAK (plugins/) |
| Głęboka zmiana UX | ❌ nie w skinie — robimy w `apps/client-panel` przez REST API `/api/` + impersonacja `admin\|user` | n/d |

`skin=evolution` w pakietach **zostaje bez zmian** → deep-linki `/evo/user/...`
w `directadmin.service.ts` i `buildDaPackageSpecFromPlan` nie wymagają modyfikacji.

## Artefakt

`ops/skins/verris-evolution/`:

- `evolution/custom.css` — do wklejenia w CSS Customizations (sekcja A: udokumentowane zmienne `--primary`, `--safe`, `--danger`, `--neutral`, `--img-logo*`, `--img-symbol*`; sekcja B: ostrożne dodatki).
- `evolution/login-page.css` — fallback, tylko jeśli NIE używamy własnego `login.html`.
- `templates/custom/login.html` — pełna strona logowania Verris (PL, dark, tokeny `|FAILEDLOGIN|`, `LOST_PASSWORD`, POST `/CMD_LOGIN`).
- `templates/custom/lost_password.html` — reset hasła (⚠ wymaga testu flow przed produkcją).
- `templates/custom/static/` — logo/favicon serwowane z `/static/`.
- `assets/` — źródłowe SVG (te same pliki co w static; do uploadu w UI Logos).
- `plugin/verris_links/` — plugin DA dodający kategorię „Verris" w menu Usera (Panel klienta, Webmail, Pomoc, Bezpłatna migracja).

Skrypt: `ops/scripts/node-da-evolution-brand.sh` (idempotentny, `--dry-run`, `--uninstall`,
`--with-lost-password`). Dystrybucja jak reszta bundla onboard:
`scp -r ops/skins/verris-evolution ops/scripts/node-da-evolution-brand.sh root@WĘZEŁ:/root/verris/`.

## Theme Colors / Main Colors — wartości do UI

Nazwy pól w UI mogą się różnić między wersjami DA — dobieraj po roli. Paleta =
`apps/client-panel/src/app/globals.css` (Pine+Mint). Zalecany wariant: **wymusić
tryb ciemny jako domyślny**, jasny zostawić jako opcję użytkownika.

| Rola | Dark (domyślny) | Light |
|---|---|---|
| Tło strony | `#091410` | `#f4f4ee` |
| Karty / powierzchnie | `#0e1f17` | `#ffffff` |
| Sidebar / nagłówek | `#0c1a14` | `#0c1a14` (sidebar zawsze pine) |
| Tekst główny | `#f4f4ee` | `#0c1a14` |
| Tekst wyciszony | `#9aa39c` | `#566058` |
| Linki / akcent | `#34e5a0` | `#0f7a52` |
| Przycisk primary | `#0f7a52` (hover `#1fa871`) | `#0f7a52` |
| Sukces | `#34e5a0` | `#1fa871` |
| Błąd / danger | `#f43f5e` | `#e11d48` |
| Obramowania | `rgba(255,255,255,.08)` | `rgba(12,26,20,.10)` |

## Uproszczenie menu Usera (Menu Customizations)

Cel: klient widzi najpierw to, czego używa co tydzień; reszta w „Zaawansowane".
Kolejność sekcji: **Strona WWW → Poczta → Dane → Zaawansowane → Verris (plugin)**.

| Zostaje na wierzchu | Trafia do „Zaawansowane" | Ukryć (dostępne przez wyszukiwarkę) |
|---|---|---|
| Menedżer plików | Zarządzanie DNS | Apache Handlers |
| Domeny (+ subdomeny, wskaźniki) | Zadania cron | MIME Types |
| Konta e-mail, przekierowania, autorespondery | Klucze SSH / Login Keys | Error Pages |
| WordPress (WP manager) | Przekierowania HTTP, ochrona katalogów | System Info |
| Bazy MySQL | Hotlink protection | — |
| Kopie zapasowe (Site Backup) | Dziennik logowań | — |
| Certyfikaty SSL | — | — |
| Wersja PHP / selektor | — | — |
| Konta FTP | — | — |
| Statystyki | — | — |

Zmiany robi się raz na poziomie admina (dziedziczą wszyscy userzy; reseller może nadpisać).
Nie ukrywać funkcji, które pakiet i tak wyłącza (`da-package-spec.ts` → feature toggles
pakietu chowają je same).

## Help Links

Customize Evolution Skin → Help Links: podmienić domyślne `evo.site-helper.com` na
`https://verris.pl/pomoc` (docelowo osobne artykuły per funkcja — spis linków
kontekstowych jak „Szybka pomoc" u konkurencji buduje content plan bloga).

## Wdrożenie na węzeł

```bash
scp -r ops/skins/verris-evolution ops/scripts/node-da-evolution-brand.sh root@node:/root/verris/
ssh root@node 'bash /root/verris/node-da-evolution-brand.sh --dry-run'   # podgląd
ssh root@node 'bash /root/verris/node-da-evolution-brand.sh'             # instalacja
# potem kroki UI 1–5 wypisane przez skrypt (raz na serwer)
```

## Kalibracja automatyzacji UI (TODO po pierwszym wdrożeniu)

Dokumentacja nie opisuje, **gdzie na dysku** DA utrwala ustawienia „Customize
Evolution Skin". Po pierwszym ręcznym zapisie w UI na węźle testowym:

```bash
ssh root@node 'find /usr/local/directadmin/data -newer /tmp/marker -type f'   # touch /tmp/marker przed zapisem
```

Znalezione pliki dopisać do artefaktu i do `node-da-evolution-brand.sh` — wtedy
kroki UI znikają i całość jest w 100% skryptowa (i weryfikowalna w audycie).

## Audyt węzła (follow-up, konwencja z roadmapy)

Dodać do `node-audit.service.ts` checki (poziom info→warn):
1. `data/templates/custom/login.html` istnieje i zawiera `Verris`;
2. `GET /static/verris-logo-light.svg` zwraca SVG;
3. `plugins/verris_links/plugin.conf` ma `active=yes`;
4. (po kalibracji) pliki customizacji Evolution zgodne z artefaktem (hash).

## Checklist weryfikacyjny po wdrożeniu / po każdym update DA

- [ ] `https://node:2222/` — login Verris (dark, logo, PL), poprawne błędne hasło → komunikat w karcie
- [ ] Logowanie działa (zwykły user + user z 2FA — krok OTP DirectAdmina po haśle!)
- [ ] `Nie pamiętasz hasła?` — link widoczny tylko przy `lost_password=1`, flow przechodzi
- [ ] Panel: kolory Pine+Mint, logo w sidebarze, favicon
- [ ] Menu Usera: kolejność i ukrycia zgodne z tabelą; wyszukiwarka znajduje ukryte funkcje
- [ ] Kategoria „Verris" w menu — 4 linki otwierają się w nowej karcie
- [ ] Help links prowadzą na verris.pl/pomoc
- [ ] Pluginy (WP manager itd.) wyglądają poprawnie na ciemnym tle

### Mobile (twardy wymóg — obecny DA ma tu braki)

- [ ] Login na telefonie: karta pełnej szerokości, pola 16px (brak auto-zoomu iOS), przycisk ≥ 48px, safe-area iPhone
- [ ] Panel na telefonie (`media:phone`/`device:mobile`): menu otwiera się i domyka, touch targety ≥ 44px
- [ ] Tabele (konta e-mail, domeny, pliki) przewijają się poziomo, nie łamią layoutu
- [ ] Menedżer plików: da się wgrać plik i zmienić uprawnienia z telefonu
- [ ] Test na realnym iOS Safari + Android Chrome (nie tylko DevTools), portret i landscape
- [ ] Po każdej aktualizacji DA powtórzyć 3 pierwsze punkty (sekcja C custom.css to reguły best-effort)

## Źródła (docs.directadmin.com, 2026-07)

- `directadmin/skins-and-templates/` + `evolution.html` (zmienne CSS, Customize Evolution Skin)
- `directadmin/skins-and-templates/customizing-login-page.html` (kontrakt login.html/lost_password.html, `/static/`)
- `developer/plugins/structure.html`, `developer/plugins/pluggable_menus.html` (plugin, menu.json)
- `developer/api/` (REST `/api/`, impersonacja `admin|user` — ścieżka dla client-panel)
- `changelog/version-1.703.html` (Evolution aktywnie rozwijany; brak nowego systemu skinów)
