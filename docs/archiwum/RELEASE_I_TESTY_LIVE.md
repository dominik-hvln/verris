> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** runbook CI/CD w `DEPLOY.md` (auto-deploy z GHCR)
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Release i testy LIVE — od commita do potwierdzenia działania

Ja (asystent) **nie mam dostępu sieciowego** z sandboxa do Twojego serwera ani
do GitHuba (brak DNS, porty 22/443 zablokowane). Dlatego commit i deploy
odpalasz Ty u siebie — poniżej dokładne komendy — a **testy LIVE przeprowadzam ja
przez przeglądarkę** (Claude w Chrome) + ten skrypt akceptacyjny.

## Krok 1 — Commit i push (na Twojej maszynie)

```bash
cd /opt/verris   # lub lokalny katalog repo
git checkout live-release-readiness      # gałąź, której używa prod-deploy-release.sh
git add -A
git commit -m "feat: P-7/P-8, passkey fixes, weryfikacja LIVE (sesja 2026-06-16)"
git push origin live-release-readiness
```

## Krok 2 — Nowe zmienne środowiskowe (uzupełnij `.env.prod` PRZED deployem)

Bez nich nowe funkcje nie ruszą (szczegóły w `WERYFIKACJA_PRODUKCYJNA.md`):

```ini
# Passkey — #1 przyczyna „błędu przy passkey", przycisk bez tego jest ukryty
WEBAUTHN_RP_ID=panel.verris.pl
WEBAUTHN_ORIGINS=https://panel.verris.pl,https://admin.verris.pl,https://staff.verris.pl
WEBAUTHN_RP_NAME=Verris

# VPS/Cloud
HETZNER_API_TOKEN=...

# Webmail (produkt e-mail)
WEBMAIL_URL=https://webmail.verris.pl
```

## Krok 3 — Deploy (na serwerze control-plane)

Masz gotowy skrypt — robi git pull, build, `migrate deploy` i health-check:

```bash
cd /opt/verris
./ops/scripts/prod-deploy-release.sh
```

Migracje z tej sesji (11 nowych) zaaplikują się idempotentnie przez
`prisma migrate deploy`. **Nie** uruchamiaj `db push`. Kolejność i lista migracji:
`WERYFIKACJA_PRODUKCYJNA.md`.

## Krok 4 — Akceptacyjny test LIVE (black-box, read-only)

Z dowolnej maszyny z dostępem do domen:

```bash
BASE_API=https://api.verris.pl \
BASE_PANEL=https://panel.verris.pl \
BASE_ADMIN=https://admin.verris.pl \
BASE_STAFF=https://staff.verris.pl \
BASE_STATUS=https://status.verris.pl \
bash ops/scripts/prod-live-acceptance.sh
```

Sprawdza: health/readyz, dostępność paneli, TLS + redirect http→https, nagłówki
bezpieczeństwa, **czy chronione endpointy zwracają 401/403 bez tokena** (wykrycie
wycieku), passkey RP, publiczne statystyki (brak mocków), rate-limit logowania,
obsługę 404. Kod wyjścia = liczba twardych błędów. **Wklej mi output** — przeanalizuję.

## Krok 5 — Snapshot zdrowia (opcjonalnie, na serwerze)

```bash
bash ops/scripts/prod-health-snapshot.sh
```

## Krok 6 — Testy funkcjonalne LIVE przez przeglądarkę (robię JA)

Gdy panel jest pod swoim URL-em i masz aktywne rozszerzenie **Claude w Chrome**,
napisz „testuj LIVE” — przejdę po realnym panelu czytając konsolę i network
(błędy JS, 4xx/5xx, brakujące nagłówki, wycieki) wg listy:

1. **Rejestracja + weryfikacja e-mail** — pełen flow, akceptacja regulaminu.
2. **Logowanie hasłem + passkey** — przycisk passkey pod formularzem, dialog systemowy; admin i klient.
3. **Pulpit** — „Pierwsze kroki”, „Do zrobienia”, trust signals.
4. **Zamawianie hostingu** — plan miesięczny/roczny (wyróżnienie oszczędności), kod promo, domena w checkoucie.
5. **Portfel** — doładowanie (Stripe test), rozliczenie subskrypcji.
6. **DNS manager** — dodaj/edytuj/usuń rekord.
7. **VPS** — zamówienie (hasło/klucz SSH), start/stop/restart.
8. **Poczta** — produkt e-mail, link do webmaila.
9. **PHP / aplikacje 1-click** — zmiana wersji, instalacja.
10. **Wsparcie** — zgłoszenie z tematem + podpowiedzi KB; CSAT; SLA; (staff) szablony.
11. **Dodatki (P-8)** — zakup z portfela; priorytetowe wsparcie podbija priorytet ticketu.
12. **Admin** — gotowość LIVE (go/no-go), plany, użytkownicy, KSeF.

Każdy znaleziony błąd raportuję z krokami repro → naprawiam w kodzie → ponowny
commit/deploy/test.

## Czego z sandboxa NIE zrobię

SSH/scp na serwer, `git push`, bezpośrednie odpalenie deployu na maszynie prod,
skan portów serwera. To wykonujesz Ty (komendy wyżej) albo dostarczasz mi output,
a ja analizuję i poprawiam kod.
