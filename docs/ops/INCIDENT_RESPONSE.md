# Procedura reagowania na incydenty i naruszenia RODO

> Sprint D.4 — dokument operacyjny LIVE. Aktualizacja 2026-09-23 (PB-11): drugi kanał alertów i procedura bez zastępcy.

## Kontakty

| Rola | Kanał |
|------|--------|
| Incydenty bezpieczeństwa / RODO | `security@verris.pl`, `rodo@verris.pl` |
| Operator on-call (wewn.) | właściciel — alerty Grafany: e-mail (Telegram usunięty decyzją właściciela 2026-09-23, PB-11); telefon +48 511 589 465 |
| PUODO | https://uodo.gov.pl/ |

Publiczny kontakt dla klientów: `kontakt@verris.pl` (patrz polityka prywatności). Nadużycia: `abuse@verris.pl` — procedura w `ops/docs/ABUSE.md`.

## Klasyfikacja

| Poziom | Przykłady | SLA reakcji |
|--------|-----------|-------------|
| **P1** | Niedostępność API/paneli, wyciek danych, kompromitacja kluczy | < 15 min ack, mitigacja < 4 h |
| **P2** | Pojedynczy węzeł DA, opóźnienia provisioning, backup > 25 h | < 1 h ack |
| **P3** | Błąd UI, ticket bez SLA, alert niekrytyczny | następny dzień roboczy |

## Kroki P1 (skrót)

1. Potwierdź zakres (status page, Grafana, `docker compose ps`, logi API).
2. Komunikat na status.verris.pl (admin → Status Page).
3. Izolacja: wyłącz komponent jeśli atak (Caddy, węzeł, klucz API).
4. Rotacja sekretów jeśli podejrzenie wycieku (`JWT_SECRET`, `APP_KMS_KEY`, Stripe webhook, MinIO).
5. Backup: ostatni obiekt `verris-backups/postgres/latest.sql.gz` — nie restore na prod bez okna.
6. Po stabilizacji: wpis post-mortem (data, przyczyna, czas MTTR, działania zapobiegawcze).

## Awaria, gdy jestem sam i poza komputerem (PB-11)

Stan na 2026-09-23: **nie ma zastępcy** — wszystko poniżej robi właściciel z telefonu. Szukanie
zastępcy (osoba z instrukcją, osobnym kontem staff bez płatności i własnym kluczem SSH) jest
zadaniem po starcie.

Na telefonie muszą być: **poczta** z alertami Grafany (jedyny kanał — PB-11), **Termius** z kluczem `verris_termius` (SSH na panel,
węzły przez `verris-node ssh`), dostęp do **konsoli Hetznera** (KVM/rescue, gdy SSH nie działa)
i do panelu admina (VPN).

1. **Alert przyszedł** (e-mail; brak codziennego „znaku życia” X-31 też jest alertem). Otwórz Grafanę albo `status.verris.pl` — czy to jeden
   węzeł, cały panel, czy tylko sonda.
2. **Komunikat dla klientów w 5 minut**, zanim zaczniesz naprawiać: admin → Status → Incydenty →
   „Zgłoś incydent” (ręczny incydent nie zamknie się sam, zamykasz go „Rozwiąż”).
3. **Panel/API leży:** Termius → panel → `cd /opt/verris && docker compose -f docker-compose.prod.yml
   --env-file .env.prod ps` → restart jednej usługi `... restart api` (nigdy `up` z bazowego compose —
   buduje ze źródeł). Nie wiesz, co się stało — nie wdrażaj nic nowego, wróć do poprzedniego obrazu
   (`ops/scripts/prod-deploy-ghcr.sh` z poprzednim SHA).
4. **Węzeł leży:** konsola Hetznera → status, restart; klientów tego węzła informuje incydent z pkt 2.
5. **Zgłoszenie od Hetznera/CERT:** `ops/docs/ABUSE.md` — najpierw zawieś zasób, potem wyjaśniaj.
6. **Nie dasz rady od razu** (brak zasięgu, noc): incydent na status page wystarcza — rekompensaty
   SLA naliczą się same po zamknięciu miesiąca. Wróć, gdy możesz; zapisz post-mortem.

## Incydent poważny — zgłoszenie do CSIRT (ustawa o KSC / NIS2, PB-24)

Dotyczy nas, gdy jesteśmy w wykazie podmiotów (dostawca usług DNS dla klientów = podmiot kluczowy
niezależnie od wielkości — `docs/legal/nis2-ksc-assessment.md`). Do czasu wpisu stosujemy procedurę
dobrowolnie — przećwiczona droga jest ważniejsza niż data wpisu.

**Incydent poważny** (definicja w ustawie o KSC po nowelizacji): poważne obniżenie jakości albo
przerwanie usługi, straty finansowe albo poważna szkoda materialna/niematerialna u innych (klientów).
Praktycznie u nas: P1 z tabeli wyżej, każdy wyciek danych, przejęcie konta administratora/węzła,
niedostępność DNS lub poczty wielu klientów.

**Zegar liczy się od wykrycia** (NIS2 art. 23 ust. 4; ustawa o KSC — ten sam schemat):

| Kiedy | Co | Treść |
|------|-----|-------|
| do **24 h** | wczesne ostrzeżenie | że incydent jest; czy podejrzewamy działanie bezprawne lub celowe; czy może mieć skutki w innym kraju UE |
| do **72 h** | zgłoszenie incydentu | aktualizacja ostrzeżenia: wstępna ocena (waga, skutki), wskaźniki naruszenia (IP, domeny, hashe), jeśli są |
| na żądanie CSIRT | sprawozdanie z postępu | stan obsługi |
| do **1 miesiąca** od zgłoszenia | sprawozdanie końcowe | szczegółowy opis, waga i skutki, rodzaj zagrożenia / pierwotna przyczyna, podjęte i trwające działania, skutki transgraniczne. Gdy incydent trwa — sprawozdanie z postępu, a końcowe w miesiąc po zakończeniu obsługi |

**Gdzie:** system **S46** (dostęp od 12.06.2026, obowiązkowo najpóźniej od 3.04.2027 — komunikat
Ministerstwa Cyfryzacji) do właściwego CSIRT; dla nas CSIRT NASK, dopóki S46 po wpisie nie wskaże
CSIRT sektorowego. Konto w S46 zakładamy zaraz po wpisie do wykazu (wykaz-ksc.gov.pl).

**Równolegle, niezależnie od CSIRT:**
1. **Klienci** — komunikat na status page w 5 minut (jak wyżej). Gdy incydent może zaszkodzić
   usługom klientów — informacja bez zbędnej zwłoki, z tym, co mogą zrobić sami (zmiana haseł, kopia).
2. **RODO** — jeśli dotyczy danych osobowych: PUODO w 72 h (sekcja niżej). To osobny obowiązek.
3. **Dowody** — nie restartuj i nie czyść węzła, zanim nie zabezpieczysz logów (`/var/log/verris-tasks/`,
   `AuditLog`, logi DA/Exim/Dovecot) — sprawozdanie końcowe wymaga przyczyny.

**Rejestr:** każdy incydent poważny i każde zgłoszenie — plik `docs/ops/incydenty/RRRR-MM-DD-nazwa.md`
(czas wykrycia, godziny wysłania ostrzeżenia/zgłoszenia/sprawozdania, decyzje, post-mortem).
**Test:** raz na kwartał sucha próba — zegar 24/72 h od fikcyjnego wykrycia, wypełnione szablony w rejestrze.

**Osoba do kontaktów z CSIRT:** właściciel (Dominik Kowalski), telefon jak w tabeli „Kontakty”,
`security@verris.pl`. Zastępcy brak (PB-11) — zmiana wymaga aktualizacji wpisu w wykazie.

## Naruszenie ochrony danych (RODO art. 33–34)

1. Ustal: co wyciekło, ilu osób, czy wysokie ryzyko dla praw osób.
2. **PUODO — 72 h** od stwierdzenia (jeśli wymagane zgłoszenie).
3. Powiadomienie osób, których dane dotyczą — gdy wysokie ryzyko (e-mail + wpis w panelu jeśli dotyczy).
4. Audyt: `SecurityAlert`, logi dostępu, `AuditLog` — zachowaj dowody.

## Powiązane

- [`PROD_HEALTH_CHECKLIST.md`](../../PROD_HEALTH_CHECKLIST.md)
- [`RESTORE_TEST.md`](./RESTORE_TEST.md)
- [`docs/legal/drafts/privacy.md`](../legal/drafts/privacy.md) § administrator
