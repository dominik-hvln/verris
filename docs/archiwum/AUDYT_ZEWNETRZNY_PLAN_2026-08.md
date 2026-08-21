> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** wykonany audyt oraz `plan-startowy-2026-08/AKTUALIZACJA_AUDYTU.md` jako procedura utrzymania
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Verris — plan audytu zewnętrznego + stack skilli

**Data:** 2026-08-12
**Perspektywa:** audytor zewnętrzny, który nie zna projektu i nie ma powodu wierzyć dokumentacji
**Podstawa:** przegląd 10 dokumentów statusowych z repo `ekohost` (maj–lipiec 2026) + research skilli publicznych (sierpień 2026)

---

## 0. Dlaczego ten audyt w ogóle ma sens

Przejrzałem Wasze dokumenty statusowe. Najnowszy (`PRODUCTION_READINESS_2026-07.md`) ma **6 tygodni**. W tym zestawie znalazłem 13 miejsc, gdzie dokumenty przeczą sobie nawzajem albo deklarują wykonanie bez dowodu. Kilka przykładów, żeby ustawić poziom:

| # | Sprzeczność | Dowód |
|---|---|---|
| 1 | Nagłówek „ETAPY 1–6 ZAIMPLEMENTOWANE ✅", a **wszystkie checkboxy pod nim puste** `[ ]`, plus zdanie „wymagane po Twojej stronie: `pnpm test`, `migrate deploy`, smoke". Dotyczy dwóch **krytycznych błędów finansowych** (F-01 cap, F-02 lost update na portfelu) | `AUDYT_PRZED_LIVE_2026-06-09.md` |
| 2 | „Zero TODO/FIXME, 236 zadań zamkniętych" (02.07) vs kilkanaście otwartych P0/P1 dwa tygodnie wcześniej (skrzynki, cron, FTP, MySQL users, restore drill) — bez śladu ich zamknięcia | `PRODUCTION_READINESS_2026-07.md` vs `BACKLOG_PRZED_STARTEM.md` |
| 3 | MFA staff: „zrobione ✅" (09.06) vs „do dorobienia przed LIVE" (10.06) vs 🟡 | `AUDYT` 7.2 vs `OCENA_PRAWNA` vs `PROD_HEALTH` |
| 4 | Restore test „✅ 2026-05-24" vs nieodhaczony w trzech innych dokumentach | `PROD_HEALTH` vs `AUDYT` 6.4, `OCENA` S-2, `PRODUCTION_READINESS` 3 |
| 5 | Trzy różne stacki pocztowe w trzech dokumentach (Resend → Postfix+Rspamd → Amazon SES), zero opisu migracji, reputacji IP i DKIM | `ROADMAP_GAPS` / `PROD_HEALTH` / `PRODUCTION_READINESS` |
| 6 | VPN paneli: „fail-open do czasu weryfikacji" (09.06) → dzień później wymieniony wśród rzeczy **dobrze zrobionych** bez zastrzeżenia | `AUDYT` ETAP 8 vs `OCENA_PRAWNA` |
| 7 | Werdykty pogarszają się w czasie: 09.06 „warunkowe GO" → 10.06 „technicznie TAK" → 02.07 **pięć kategorii ⛔**. Lista blokerów rośnie, nie maleje | trzy dokumenty |
| 8 | Baza 12 MB, backup 51 KiB, 10 połączeń — wszystkie „✅ smoke" dotyczą środowiska **bez klientów**. Cert `panel.verris.pl` ważny do **2026-08-15**, a auto-odnawianie Caddy jest w backlogu jako [P0] „do potwierdzenia" | `PRODUCTION_READINESS`, `BACKLOG` |

To nie jest lista czepialstwa. To jest wzorzec: **status „DONE" bywa nadawany na podstawie części zakresu i bez uruchomienia testów.** Dopóki ten wzorzec nie zostanie przełamany, żadna checklista wewnętrzna nie ma wartości dowodowej — i dlatego audyt musi być prowadzony na dowodach, nie na deklaracjach.

---

## 1. Reguła naczelna: skala dowodowa

Każde twierdzenie o gotowości dostaje poziom dowodu. **Nic poniżej D2 nie liczy się jako „zrobione".**

| Poziom | Co to znaczy | Przykład |
|---|---|---|
| **D0** | Napisane w dokumencie | „2FA wymuszone na staffie ✅" |
| **D1** | Istnieje kod, który to robi | `REQUIRE_MFA_FOR_STAFF` w guardzie |
| **D2** | Test przechodzi w CI i widać go w logu builda | e2e: logowanie staff bez 2FA → 403 |
| **D3** | Zaobserwowane na produkcji z timestampem | log/metryka/screenshot z prod |
| **D4** | Powtarzalna procedura z nazwanym właścicielem i datą ostatniego wykonania | restore drill: runbook + wynik + kto + kiedy |

Obszary krytyczne (pieniądze, dane klienta, dostęp) wymagają **D3 lub D4**. Bezpieczeństwo backupów i DR — wyłącznie **D4**.

Druga reguła: **dokument starszy niż 30 dni traci status dowodu** i wraca do D0 do czasu ponownej weryfikacji. To automatycznie unieważnia większość obecnego zestawu.

---

## 2. Stack skilli

Dobrane pod cztery obszary, które wskazałeś. Wszystkie linki sprawdziłem; przy każdym podaję poziom weryfikacji, żebyś nie instalował niczego w ciemno.

### 2.1 Rdzeń — zainstaluj to

| Skill / paczka | Po co w tym audycie | Instalacja | Weryfikacja |
|---|---|---|---|
| **pm-skills** (68 skilli, 9 pluginów, MIT) | Kręgosłup całego audytu. Kluczowe: `intended-vs-implemented` (deklaracje vs kod — dokładnie Wasz problem), `strategy-red-team`, `pre-mortem`, `security-audit-static`, `performance-audit-static`, `shipping-artifacts`, `pricing-strategy`, `business-model`, `market-sizing`, `competitor-analysis`, `identify-assumptions` | Cowork: Customize → Browse plugins → Add marketplace from GitHub → `phuryn/pm-skills`<br>CLI: `claude plugin marketplace add phuryn/pm-skills` | ✅ repo i lista pluginów potwierdzone |
| **trailofbits/skills** (~40 skilli, CC-BY-SA) | Twardy audyt kodu przez firmę, która robi to zawodowo: `differential-review` (co się zmieniło od ostatniego audytu), `variant-analysis` (ten sam błąd w innych miejscach — istotne przy F-01/F-02), `semgrep-rule-creator`, `mutation-testing`, `property-based-testing` (portfel/ledger to podręcznikowy przypadek) | `/plugin marketplace add trailofbits/skills` | ✅ 5,5k ★, potwierdzone |
| **claude-code-owasp** | Checklisty OWASP Top 10:2025 + **ASVS 5.0 z ID wymagań** — daje audytowi bezpieczeństwa numerowany standard zamiast „przejrzeliśmy" | `npx degit agamm/claude-code-owasp/.claude/skills/owasp-security ~/.claude/skills/owasp-security` | ✅ potwierdzone |
| **obra/superpowers** | Warstwa dyscypliny, nie treści: `verification-before-completion` (blokuje ogłaszanie sukcesu bez sprawdzenia — lek na wzorzec #1 i #2), `systematic-debugging`, `subagent-driven-development`, `writing-plans` | `/plugin install superpowers@claude-plugins-official` | ✅ potwierdzone |
| **vercel-labs/agent-skills** | `web-design-guidelines` — 100+ reguł, w tym dostępność (aria, semantyka, focus, kontrast). To Wasz punkt zaczepienia pod **EAA**, bo dedykowanego skilla EAA nie ma. Plus `react-best-practices` pod panele Next.js | `npx skills add vercel-labs/agent-skills` | ✅ potwierdzone |
| **anthropics/skills** | `webapp-testing` (Playwright — realne E2E na panelu zamiast smoke „do wykonania po deployu"), `skill-creator` (do napisania brakujących skilli z §2.3) | `npx skills add https://github.com/anthropics/skills --skill webapp-testing` | ✅ oficjalne |

### 2.2 Czego świadomie NIE polecam

- **brutal-review / „Gordon Ramsay persona"** (mcpmarket) — brzmi kusząco, ale **nie potwierdziłem jej istnienia w repo źródłowym** `fiatkongen/saurun-marketplace`; repo zawiera co innego. Nie instaluj z listingu marketplace'u bez sprawdzenia źródła. `strategy-red-team` + `pre-mortem` z pm-skills robią to samo, tylko metodycznie zamiast teatralnie.
- **ECC / everything-claude-code** — katalog stron trzecich reklamuje skilla `production-audit`, ale w samym repo go nie znalazłem, a metadane repo są niewiarygodne. Pomijam.
- **Paczki marketingowe** (Corey Haines, nginity, Mafia Skills) — masz już włączone `verris-marketing`, `cro`, `ai-seo`, `site-architecture`, `marketing-psychology` i pakiet `marketing:*`. Duplikat by tylko rozmył kontekst.
- **Wszystko, co obiecuje „audyt jednym poleceniem"** — audyt nie jest jednym poleceniem, jest ścieżką dowodową.

### 2.3 Luki, których żaden gotowy skill nie zakrywa

Na te obszary **nie ma nic sensownego w publicznym ekosystemie** (sprawdzone). Tu albo piszemy własne skille (`skill-creator`), albo robimy to ręcznie:

1. **RODO/DPA/RCPD po polsku** — rejestr czynności art. 30, role administrator vs procesor, DPA z subprocesorami (Stripe, OVH, Hetzner, OpenProvider, SES, MinIO), transfery poza EOG.
2. **KSeF 2.0 / FA(3)** — masz w pamięci projektu fakty techniczne, ale moduł generuje **FA(2)/KSeF 1.0**, czyli standard nieobowiązujący. To osobny, twardy bloker prawny.
3. **Unit economics hostingu** — koszt licencji per węzeł (CloudLinux + LiteSpeed + DirectAdmin + Imunify) + amortyzacja serwera vs 39 zł/mies. Nikt nie napisał skilla do liczenia marży hostingu współdzielonego.
4. **DR/RTO/RPO dla control-plane** — 1 host, 1 replika API, crony bez leader-election.
5. **Abuse / AUP / DMCA / retencja logów** — obowiązki operatora hostingu.

---

## 3. Plan audytu — 8 faz

Szacunek: **~12 dni roboczych** pracy skupionej. Fazy 1–3 są zaporowe: jeśli wypadną źle, dalsze nie mają sensu.

### Faza 0 — Zamrożenie stanu (0,5 dnia)

Cel: ustalić, co w ogóle jest przedmiotem audytu.

- Snapshot repo (commit hash, data), zrzut listy kontenerów prod, wersje migracji w DB.
- **Rejestr twierdzeń**: wyciągnąć z wszystkich dokumentów każde „✅ / DONE / gotowe / wdrożone" do jednej tabeli. Kolumny: twierdzenie, źródło, data, poziom dowodu (domyślnie D0), status weryfikacji.
- Ustalić rzeczywisty stan faktyczny: **czy są płacący klienci?** Jeśli tak — audyt zmienia charakter z „przed startem" na „naprawa w locie", a część ustaleń staje się incydentami.
- Data ostatniego commita per obszar — pokaże, co jest martwe.

**Wyjście:** rejestr twierdzeń (~100–200 pozycji). To jest lista rzeczy do obalenia.

### Faza 1 — Deklaracja vs kod (2 dni) ⛔ zaporowa

Skille: `intended-vs-implemented`, `shipping-artifacts`, `differential-review`

- Dla każdego twierdzenia z Fazy 0 o poziomie krytycznym: znaleźć kod, znaleźć test, znaleźć log. Brak któregokolwiek = twierdzenie obalone.
- Priorytet 1: **F-01 (cap) i F-02 (lost update na portfelu)** — to pieniądze klientów, ogłoszone jako naprawione bez uruchomienia testów. Wymagany dowód D3 + test własnościowy (`property-based-testing`).
- Priorytet 2: MFA staff, VPN/fail-open Caddy, XFF (F-10 vs 7.3 — sprawdzić, czy naprawa jednego nie przywróciła spoofingu IP w rate-limicie i audycie).
- Priorytet 3: funkcje ogłoszone 16.06 w jednej sesji (VPS/Hetzner, domeny/OpenProvider, poczta, webmail, 1-click, free trial) — w `ROADMAP_GAPS` miesiąc wcześniej domeny to **XL, faza 3**. Zakres tej wielkości nie powstaje w dzień. Sprawdzić, co z tego jest szkieletem, a co działa.
- Priorytet 4: G-6 „migracja DONE", gdy transfer plików/bazy/IMAP = ❌. Ustalić, ile innych DONE ma ten sam charakter.

**Kryterium przejścia:** < 20% twierdzeń krytycznych obalonych. Powyżej — dokumentacja jest niewiarygodna jako całość i trzeba ją odbudować od kodu (`shipping-artifacts`), zanim cokolwiek innego ma sens.

### Faza 2 — Bezpieczeństwo i dane (2 dni) ⛔ zaporowa

Skille: `owasp-security` (ASVS 5.0), `security-audit-static`, `variant-analysis`, `semgrep-rule-creator`

- Mapa granic zaufania: kto może wywołać co. Panel klienta → API → węzeł DA. Multi-tenancy: czy klient A może dosięgnąć zasobu klienta B (IDOR na `serverId`, `domainId`, `accountId`).
- **Sekrety**: rotacja kluczy SES wklejonych wcześniej do czatu — potwierdzić wykonanie z datą. Skan historii gita pod kątem sekretów. `APP_KMS_KEY` — gdzie leży, kto ma dostęp, co się dzieje po utracie.
- `variant-analysis` na wzorcu F-02 (lost update): znaleźć **wszystkie** miejsca, gdzie stan finansowy jest czytany-modyfikowany-zapisywany bez blokady lub transakcji.
- Webhooki Stripe: weryfikacja podpisu + idempotencja (podwójne naliczenie = pieniądze klienta).
- Bootstrap węzła tokenem jednorazowym — cykl życia tokenu, co po przechwyceniu.
- Dane testowe na prod (`#1F4CEEA7`, `test-live-verris.pl`) — usunięte czy nie.
- CSP, rate limiting, antybot, anty-spam outbound (CYBER-1…11).

**Kryterium przejścia:** zero ustaleń krytycznych w obszarze pieniędzy i izolacji najemców.

### Faza 3 — Odtwarzalność (1 dzień) ⛔ zaporowa

To jedyna faza z twardym wymogiem **D4** — procedura wykonana na zegarze, nie opisana.

- **Restore drill DB**: skasować, odtworzyć z backupu, zmierzyć czas. Zapisać RTO rzeczywiste.
- **Restore konta klienta**: S-1 mówi, że backupy kont off-node nie istnieją. Jeśli tak — to jest bloker startu, nie backlog. Hosting bez odtworzenia konta klienta nie jest produktem.
- Szyfrowanie dumpów (S-2), off-site mirror (`MIRROR_EXTERNAL_ENABLED=0` domyślnie — sprawdzić prod).
- **DR całego control-plane**: 1 host, 1 replika API, crony bez leader-election. Ile trwa odtworzenie z zera? Kto to robi, gdy Ciebie nie ma?
- Cert `panel.verris.pl` — dokument z 02.07 podaje ważność do **2026-08-15**, czyli za 3 dni, a auto-renew Caddy jest w backlogu jako [P0] „do potwierdzenia". Próbowałem to sprawdzić z sandboxa, ale ruch idzie przez bramę egress i widzę cert bramy, nie Wasz. **Sprawdź to lokalnie dzisiaj:**
  ```
  echo | openssl s_client -servername panel.verris.pl -connect panel.verris.pl:443 2>/dev/null \
    | openssl x509 -noout -issuer -dates
  ```
  Jeśli `notAfter` jest bliski i issuer to nie Let's Encrypt z niedawnego `notBefore` — auto-renew nie działa.
- Ustalić i zapisać **RTO/RPO** — obecnie nie istnieją w żadnym dokumencie.

**Kryterium przejścia:** restore konta klienta wykonany i udokumentowany. Bez tego NO-GO, kropka.

### Faza 4 — Legal i compliance (2 dni)

Bez gotowego skilla — praca ręczna + `privacy-policy` z pm-toolkit jako szkielet, ale **wymaga prawnika**, nie AI.

- Dokumenty prawne: status DRAFT 0.2 / `1.0.0-draft`, brak danych rejestrowych, brak review prawnika (L-1). Dane rejestrowe masz zapisane w pamięci projektu — brak jest w publikacji, nie w wiedzy.
- **KSeF**: moduł generuje FA(2)/KSeF 1.0. Obowiązkowy KSeF ruszył 01.02/01.04.2026. To znaczy, że **wystawianie faktur w obecnym kształcie jest niezgodne**. Priorytet równy blokerom technicznym.
- DPA z każdym subprocesorem + lista + lokalizacja danych (L-2). Role administrator/procesor (L-3). RCPD art. 30 (L-4). Transfery poza EOG (L-5). Skrzynki `rodo@`/`abuse@`/`security@` + decyzja o IOD (L-6).
- **VAT od bonów przedpłaconych** (portfel) — nierozstrzygnięty. Wymaga interpretacji indywidualnej; to nie jest rzecz do „zdecydowania samemu".
- SLA: pole `supportSlaHours` istnieje w kodzie, polityki SLA nie ma. Zgodnie z ustaleniem z lipca kredyty SLA są domyślnie wyłączone — sprawdzić, czy marketing tego nie obiecuje.
- **EAA / dostępność** — `web-design-guidelines` na panelu klienta i www.
- Omnibus przy cenach promocyjnych, AUP/abuse/DMCA/retencja logów.

### Faza 5 — Ekonomia i model biznesowy (2 dni)

Skille: `pricing-strategy`, `business-model`, `market-sizing`, `competitor-analysis`, `identify-assumptions`, `beachhead-segment`

**Największa dziura w całej dokumentacji: nie ma ani jednej liczby o pieniądzach.** Jedyna wzmianka o kosztach to „Imunify360 gdy budżet pozwoli".

- **Koszt węzła w pełni obłożonego**: serwer (EX63 149 €) + CloudLinux + LiteSpeed + DirectAdmin + Imunify + backup storage + transfer. Podzielić przez realną liczbę kont na węzeł. To jest podłoga cenowa.
- Marża przy 39 zł/mies i 349 zł/rok. Przy jakim obłożeniu węzeł wychodzi na zero.
- Koszt pozyskania klienta z kampanii 500–1000 zł/mies vs LTV przy realistycznym churnie hostingu. Ile miesięcy do zwrotu.
- Runway: koszty stałe (serwery + licencje + narzędzia) vs zero przychodu. Ile miesięcy pustego biegu wytrzymujesz.
- Konkurencja PL — porównanie parametr-po-parametrze, nie hasłowe. Gdzie realnie jesteś tańszy/lepszy, a gdzie tylko tak brzmi.
- **Weryfikacja obietnic marketingowych w kodzie** — masz już tę zasadę zapisaną („analityka bez cookies" była sprzedawana bez implementacji). Przejechać całą `oferta.md` i landing `/przenies-strone` przeciw kodowi. Szczególnie migrację: strona obiecuje przeniesienie, kod robi ticket.
- `identify-assumptions` + `prioritize-assumptions`: wypisać założenia biznesowe i posortować po **koszcie testu**, nie po ważności.

### Faza 6 — Operacje i bus factor (1 dzień)

- **Wszystkie alerty idą na jeden adres** `dominik@hvln.pl`. Kto odbiera w nocy. Co się dzieje przy 5 dniach niedostępności jednej osoby.
- Alerty nie są podpięte do człowieka/kanału i **nie były testowane** (S-7). Wywołać sztuczny incydent i zmierzyć, czy alert dotarł.
- Brak niezależnego monitora uptime (monitoring w tej samej infrze co produkt = ślepota na awarię całości).
- Support: godziny, kanały, czasy reakcji, eskalacja, kto zastępuje. Obecnie nie istnieje jako proces.
- Runbooki: `INCIDENT_RESPONSE.md` istnieje — sprawdzić, czy ktokolwiek go przeszedł od początku do końca.
- Onboarding/offboarding dostępów, przegląd uprawnień (R-17 w backlogu).
- **Plan wyjścia klienta** — pełny eksport konta (pliki + bazy + poczta). Nie istnieje. To jednocześnie wymóg RODO/przenośności i element zaufania: hosting bez drzwi wyjściowych sprzedaje się gorzej.

### Faza 7 — Red team i pre-mortem (1 dzień)

Skille: `strategy-red-team`, `pre-mortem`

- **Pre-mortem:** „Jest luty 2027, Verris jest zamknięty. Napisz, dlaczego." Osobno scenariusz techniczny, biznesowy i prawny.
- **Red team:** zaatakować założenia nośne. Kandydaci na główne: (a) że migracja klienta jest osią sprzedaży, choć kod robi tylko ticket; (b) że jednoosobowy zespół udźwignie 24/7 hostingu; (c) że 39 zł/mies pokrywa licencje i amortyzację; (d) że własna platforma była tańsza niż WHMCS/cPanel; (e) że klienci hostingu w PL kupują nieznaną markę bez opinii.
- Dla każdego założenia: **najtańszy test, który je obali** — i ranking po koszcie testu.

### Faza 8 — Werdykt (0,5 dnia)

- Rejestr ustaleń: ID, obszar, opis, dowód, wpływ, prawdopodobieństwo, rekomendacja, właściciel, termin.
- Rating: **Krytyczne** (blokuje start / naraża pieniądze lub dane klienta / niezgodne z prawem) · **Wysokie** (blokuje skalowanie) · **Średnie** · **Niskie**.
- **Jedna tabela GO/NO-GO** z 8–10 warunkami zaporowymi. Bez sformułowań „warunkowe GO" — to właśnie ta formuła pozwoliła w czerwcu przejść dalej z otwartymi blokerami.
- Ocena punktowa 0–100 per obszar, żeby przy powtórce audytu było widać ruch.

---

## 4. Otwarte pytania, na które audyt musi odpowiedzieć

Pytania ostre, w kolejności, w jakiej zadałby je ktoś z zewnątrz:

1. Czy dziś, 12 sierpnia, są płacący klienci? Jeśli tak — na jakich dokumentach prawnych i z jakimi fakturami?
2. Czy istnieje sprawny węzeł produkcyjny z ważnymi licencjami? (`PROD_HEALTH` mówi N/A, `AUDYT` mówi Node-PL-01, `BACKLOG` mówi że licencja LiteSpeed wygasła.)
3. Czy `pnpm test` przechodzi na HEAD? Ile testów, jakie pokrycie ścieżek finansowych?
4. Czy F-01 i F-02 mają test, który failuje na starym kodzie i przechodzi na nowym?
5. Kiedy ostatnio odtworzono backup i ile to trwało?
6. Czy istnieje backup konta klienta, który da się odtworzyć bez węzła źródłowego?
7. Kiedy rotowano klucze SES i czy stare zostały unieważnione?
8. Ile kosztuje jeden węzeł miesięcznie w pełni obłożony i jaka jest marża przy 39 zł?
9. Co dokładnie dostaje klient, który klika „przenieś stronę"?
10. Kto obsługuje awarię w sobotę o 3:00?
11. Czy faktura wystawiona jutro jest zgodna z obowiązkowym KSeF?
12. Czy istnieje podpisane DPA choćby z jednym subprocesorem?
13. Czy cert `panel.verris.pl` odnowi się sam przed 15 sierpnia?
14. Które funkcje z listy z 16 czerwca faktycznie działają end-to-end, a które są szkieletem?
15. Co obiecuje `oferta.md` i landing, czego kod nie robi?

---

## 5. Kolejność uruchomienia

1. **Dziś:** sprawdzić cert `panel.verris.pl` komendą z Fazy 3 (wg dokumentu wygasa 15.08) — niezależnie od wszystkiego.
2. **Dziś:** zainstalować rdzeń z §2.1.
3. **Faza 0** — zbudować rejestr twierdzeń.
4. **Fazy 1–3** równolegle-sekwencyjnie; to bramka. Jeśli Faza 1 obali > 20% twierdzeń krytycznych, przerywamy i odbudowujemy dokumentację od kodu.
5. **Fazy 4–6** — mogą iść równolegle, bo dotykają różnych obszarów.
6. **Faza 7–8** — werdykt.

Do Fazy 4 (KSeF, DPA, VAT od bonów) potrzebny jest prawnik i księgowa. AI zbuduje listę pytań i szkice; nie zastąpi podpisu.

---

## 6. Czego ten audyt świadomie nie zrobi

Uczciwie, żeby nie było złudzeń co do zakresu:

- **Nie zastąpi zewnętrznego pen-testu.** Analiza statyczna i przegląd kodu to nie to samo co ktoś, kto atakuje działającą instancję.
- **Nie zastąpi opinii prawnej.** Wskaże, czego brakuje; nie oceni ryzyka procesowego.
- **Nie zweryfikuje wydajności pod obciążeniem** bez realnych testów obciążeniowych na węźle z licencjami.
- **Nie oceni jakości obsługi klienta**, bo nie ma jeszcze klientów.

---

*Źródła research'u skilli: [awesome-claude-skills (travisvn)](https://github.com/travisvn/awesome-claude-skills) · [pm-skills (phuryn)](https://github.com/phuryn/pm-skills) · [PM Skills 2.0 — Product Compass](https://www.productcompass.pm/p/pm-skills-2-red-team-ship) · [Trail of Bits Skills](https://github.com/trailofbits/skills) · [claude-code-owasp](https://github.com/agamm/claude-code-owasp) · [obra/superpowers](https://github.com/obra/superpowers) · [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) · [anthropics/skills](https://github.com/anthropics/skills) · [Snyk: Top Claude Skills for Cybersecurity](https://snyk.io/articles/top-claude-skills-cybersecurity-hacking-vulnerability-scanning/) · [Firecrawl: Best Claude Code Skills](https://www.firecrawl.dev/blog/best-claude-code-skills) · [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)*
