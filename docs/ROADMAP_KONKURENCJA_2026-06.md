# Rekomendacje rozwojowe przed startem LIVE — benchmark konkurencji (2026-06-09)

Punkt odniesienia: **dhosting** (elastyczny hosting, rozliczanie za zużycie), **cyberfolks**
(performance + WP, backupy 28 dni), **home.pl / nazwa.pl** (skala, domeny, marketing),
zagranica: **SiteGround** (staging, git), **Hostinger** (cena + AI onboarding), **o2switch**
(prostota „wszystko w cenie"), **Krystal/GreenGeeks** (eko — bezpośredni konkurent EKO Mode).

Twoje istniejące wyróżniki (nikt w PL nie ma wszystkich trzech): **autoskalowanie per zasób
rozliczane w blokach 15 min**, **portfel przedpłacony + rozliczanie godzinowe**, **EKO Mode**.
To jest przekaz marketingowy — poniższe rekomendacje mają domknąć „stawkę podstawową",
której klient oczekuje od każdego hostingu, zanim doceni wyróżniki.

---

## A. Quick wins przed startem (stack już to umie — włączyć/wyeksponować; 1–3 dni każdy)

| # | Co | Dlaczego (konkurencja) | Jak u Ciebie |
|---|---|---|---|
| A1 | **Auto-SSL (Let's Encrypt) dla każdej domeny klienta** — włączone domyślnie po provisioningu, nie „na życzenie" | Standard u 100% konkurencji | DA ma wbudowane LE; dołożyć do profilu hostingowego `enable letsencrypt=1` + auto-issue po `createAccount`; walidator w audycie węzła |
| A2 | **Wybór wersji PHP per domena (CloudLinux PHP Selector)** | dhosting/cyberfolks eksponują 7.4–8.4 | CageFS już aktywny — doinstalować `lvemanager`/alt-php w profilu hostingowym; w panelu klienta link głęboki do DA |
| A3 | **LSCache + HTTP/3 (QUIC)** włączone serwerowo | cyberfolks robi z LSCache flagship performance | LiteSpeed już jest; w `node-hosting-profile.sh` ustawić cache root + quic; wtyczka LSCache w instalatorze WP (A4) |
| A4 | **Instalator aplikacji 1-click (WordPress)** — minimum WP, docelowo Softaculous/Installatron | absolutny standard (home.pl, Hostinger…) | Najtaniej: WP Toolkit dla DA albo własny task `WP_INSTALL` w istniejącym silniku NodeTask (wp-cli na węźle); UI w panelu klienta przy usłudze |
| A5 | **Auto-DKIM dla domen klientów** + poprawny SPF w szablonie zony | deliverability = reklamacje; konkurencja ma | DA generuje DKIM (`dkim=1` w options.conf) — wymusić w profilu hostingowym, sprawdzać w audycie |
| A6 | **Redis per konto** (object cache dla WP) | cyberfolks sprzedaje to jako „turbo" | Flaga `redis` już istnieje w `DaPackageFeatures` — włączyć w pakietach planów + krótki poradnik |

## B. Filary jakości — pierwsze 30–90 dni (większa praca, decydują o opinii)

| # | Co | Dlaczego | Zarys wdrożenia |
|---|---|---|---|
| B1 | **Backupy kont klientów off-node z self-restore** (pliki+bazy, retencja 14–28 dni) | dhosting 14 dni, cyberfolks 28 — to pierwsze pytanie klienta po awarii | Masz już `hosting-restore` (restore) i DA backup (`Account.lastBackupAt`) — domknąć: harmonogram per węzeł → upload borg/restic do MinIO/S3 **poza węzłem**, UI „przywróć plik/bazę/całość" w panelu klienta, test restore w smoke |
| B2 | **Skaner malware + WAF** (Imunify360 lub ImunifyAV+ / ModSecurity OWASP CRS na LiteSpeed) | cyberfolks/home.pl mają WAF+antymalware w standardzie | Licencja per węzeł; instalacja w profilu hostingowym; wyniki skanów do panelu (nowy NodeTask kind); kwarantanna + mail do klienta |
| B3 | **Monitoring stron klientów z powiadomieniami** („Twoja strona nie odpowiada") | wyróżnik dhosting; buduje zaufanie | Masz prober platformowy (probes per node) — dodać probe per domena klienta (opt-in), notyfikacja e-mail + wpis w panelu; cap na częstotliwość |
| B4 | **Sekundarny DNS na niezależnej lokalizacji** (ns3 poza control-plane/węzłem) | nazwa.pl ma anycast; pojedynczy DC = pojedyncza awaria DNS | Najprościej: ClouDNS/BuddyNS secondary albo mały VPS w innym DC z AXFR z DA; automatyzacja w `node-dns.service` |
| B5 | **Staging / klon strony jednym kliknięciem** | SiteGround standard, w PL rzadkość = przewaga | Nowy NodeTask: kopia katalogu+bazy do subdomeny `staging.<domena>`, push-to-live z backupem; UI przy usłudze |
| B6 | **SSH + Git deploy per konto** (opt-in, CageFS izoluje) | SiteGround/cyberfolks dla devów | Flaga `ssh` już w `DaPackageFeatures`; UI kluczy SSH w panelu klienta; docs |

## C. Różnicowanie i sprzedaż (po stabilizacji)

| # | Co | Uwagi |
|---|---|---|
| C1 | **Marketing autoskalowania**: publiczny kalkulator (jest) + „cap kosztów" jako bezpiecznik (działa po F-01) — komunikować „nigdy nie zapłacisz więcej niż X" | unikat w PL; dhosting rozlicza elastycznie, ale nie skaluje LVE w locie |
| C2 | **Passkeys (WebAuthn) logowanie** obok TOTP | nikt w PL hostingu tego nie ma; niski koszt (biblioteka @simplewebauthn) — silny sygnał „security-first" |
| C3 | **Sesje urządzeń w panelu klienta** (lista + wyloguj wszystkie) | uzupełnienie 2FA; oczekiwane przy „security-first" |
| C4 | **Rejestracja domen** (OVH API już zintegrowane dla NS) | home.pl/nazwa.pl żyją z domen; masz `CHARGE_DOMAIN` i moduł domen — domknąć zakup/odnowienia przez OVH reseller |
| C5 | **EKO Mode raport** (CO₂/kWh per konto, badge — jest w roadmapie G) | Krystal/GreenGeeks robią na tym globalny marketing; w PL nisza wolna |
| C6 | **Publiczne API + tokeny API dla klientów** | dla agencji/devów; masz kontrakty — wystawić scoped PAT |
| C7 | **White-label / konta agencyjne** (IAM subkonta już są) | agencje = najlepszy kanał wzrostu w PL |

## D. Czego NIE robić przed startem

- Własny anycast DNS, multi-region control-plane, Kubernetes — przerost na 1–3 węzły.
- Marketplace aplikacji poza WP — najpierw WP (≈70% rynku).
- Telefoniczne BOK 24/7 — SLA na tickety + status page wystarczą na start; konkurujesz czasem reakcji, nie kanałem.

## Proponowana kolejność

1. **Tydzień przed LIVE:** A1, A5 (SSL+DKIM — reklamacje mailowe to najgorszy start), A3.
2. **Start LIVE:** A2, A6, ETAP 7 checklist (backupy offsite!, VPN, monitoring).
3. **Miesiąc 1:** B1 (backupy klientów — priorytet #1 całej listy), A4 (WP installer).
4. **Miesiąc 2–3:** B2 (Imunify/WAF), B3 (monitoring stron), B4 (secondary DNS), C2/C3.
5. **Kwartał 2:** B5/B6 (staging, git), C4 (domeny), C5–C7.

> Uzasadnienie priorytetu B1: w hostingu współdzielonym utrata danych klienta to
> jedyna nieodwracalna awaria. Backup per konto poza węzłem + self-restore w panelu
> to też najczęstsze kryterium porównawcze w rankingach (dhosting/cyberfolks
> eksponują liczbę dni retencji na stronie głównej).
