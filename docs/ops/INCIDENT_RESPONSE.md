# Procedura reagowania na incydenty i naruszenia RODO

> Sprint D.4 — dokument operacyjny LIVE. Aktualizacja 2026-09-23 (PB-11): drugi kanał alertów i procedura bez zastępcy.

## Kontakty

| Rola | Kanał |
|------|--------|
| Incydenty bezpieczeństwa / RODO | `security@verris.pl`, `rodo@verris.pl` |
| Operator on-call (wewn.) | właściciel — alerty Grafany: e-mail + Telegram (PB-11); telefon +48 511 589 465 |
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

Na telefonie muszą być: **Telegram** (alerty), **Termius** z kluczem `verris_termius` (SSH na panel,
węzły przez `verris-node ssh`), dostęp do **konsoli Hetznera** (KVM/rescue, gdy SSH nie działa)
i do panelu admina (VPN).

1. **Alert przyszedł** (Telegram/e-mail). Otwórz Grafanę albo `status.verris.pl` — czy to jeden
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

## Naruszenie ochrony danych (RODO art. 33–34)

1. Ustal: co wyciekło, ilu osób, czy wysokie ryzyko dla praw osób.
2. **PUODO — 72 h** od stwierdzenia (jeśli wymagane zgłoszenie).
3. Powiadomienie osób, których dane dotyczą — gdy wysokie ryzyko (e-mail + wpis w panelu jeśli dotyczy).
4. Audyt: `SecurityAlert`, logi dostępu, `AuditLog` — zachowaj dowody.

## Powiązane

- [`PROD_HEALTH_CHECKLIST.md`](../../PROD_HEALTH_CHECKLIST.md)
- [`RESTORE_TEST.md`](./RESTORE_TEST.md)
- [`docs/legal/drafts/privacy.md`](../legal/drafts/privacy.md) § administrator
