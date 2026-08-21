> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** plan 19 sprintów w `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` wraz z backlogiem XLSX. Procedury aktywacji funkcji są w `docs/ops/WDROZENIE_2026-06-10.md`
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Checklista startu 100% LIVE — Verris

Jeden, autorytatywny przebieg do uruchomienia produkcyjnego. Panel admina ma
też automatyczny check: **Ustawienia → Gotowość do startu LIVE** (`GET
/admin/live-readiness`) — pokazuje GO/NO-GO i co jeszcze trzeba ustawić.

Szczegóły poszczególnych funkcji: `WDROZENIE_2026-06-10.md` (sekcje 0a–0f).

---

## 1. Build, migracje, deploy (z Twojej maszyny)

```bash
pnpm install                       # nowe zależności (@simplewebauthn itd.)
pnpm --filter @verris/database db:generate
pnpm --filter @verris/database exec prisma migrate deploy
pnpm typecheck && pnpm build
pnpm --filter api test
git add -A && git commit -m "LIVE: trial, migracje, passkey, backupy, e-mail, readiness" && git push
# deploy wg Twojego pipeline (API + 3 panele + status-page)
```

Najnowsze migracje do wdrożenia (oprócz wcześniejszych):
`20260616100000_staff_passkey_enforcement`, `20260616120000_free_trial`,
`20260616140000_offsite_backup`, `20260616160000_plan_product_kind`.

## 2. Sekrety i konfiguracja API (env) — BLOKUJĄCE

- [ ] `APP_KMS_KEY` (≥32 znaki) — szyfrowanie sekretów at-rest.
- [ ] `JWT_SECRET` — silny, losowy.
- [ ] `STRIPE_SECRET_KEY` = **sk_live_…** (produkcyjny, nie test).
- [ ] `STRIPE_WEBHOOK_SECRET` — z produkcyjnego endpointu webhooka Stripe.
- [ ] `SMTP_HOST` + dane SMTP — poczta transakcyjna (weryfikacja/reset).
- [ ] `CLIENT_PANEL_URL`, `ADMIN_PANEL_URL`, `STAFF_PANEL_URL`, `PUBLIC_API_URL`.

## 3. Dane firmy + faktury — BLOKUJĄCE

- [ ] Ustawienia → Firma i faktury: nazwa, NIP, adres, miasto (na fakturach).
- [ ] (Opcjonalnie) KSeF: token + klucz na środowisku **test**, smoke (`ops/scripts/ksef-smoke.ts`), potem `prod` + `KSEF_ENABLED=1`.

## 4. Dokumenty prawne — BLOKUJĄCE

- [ ] Opublikuj aktualne **Regulamin (TERMS)** i **Polityka prywatności (PRIVACY)**
      (`ops/scripts/prod-legal-publish-live.sh`). Bez nich rejestracja jest blokowana.
- [ ] (Zalecane) DPA + Cookies.

## 5. Flota i hosting — BLOKUJĄCE

- [ ] Co najmniej 1 węzeł **ACTIVE** (onboarding: `ops/scripts/node-onboard-live.sh`).
- [ ] Nameservery platformy `HOSTING_NS1/НS2` (+ ewentualnie NS3).
- [ ] Na węźle: detektor skanu, worker migracji, worker backupu offsite (instalują się w onboardingu).

## 6. Poczta — deliverability + webmail

- [ ] **SPF/DKIM/DMARC** dla domeny nadawczej (`ops/scripts/prod-mail-dkim-outbound-fix.sh`, rspamd). Bez tego maile lądują w spamie.
- [ ] Webmail Roundcube: `ops/scripts/prod-roundcube-install.sh` + `WEBMAIL_URL` w ustawieniach.

## 7. Backupy off-node — BLOKUJĄCE (S-1)

- [ ] Na węźle: `rclone` remote typu **crypt** + `/etc/verris-backup.conf`.
- [ ] Timer `verris-offsite-backup` działa; w panelu admina readiness pokazuje „backup OK".

## 8. Domeny (rejestrator)

- [ ] OpenProvider: `OPENPROVIDER_USERNAME/PASSWORD` + owner handle (sekcja 0 WDROZENIE). Inaczej rejestracja domen w checkoucie jest nieczynna.

## 9. Konta uprzywilejowane (admin/staff)

- [ ] Każdy admin/staff: logowanie hasłem → **passkey** + **kody break-glass** (Ustawienia → Bezpieczeństwo).
- [ ] Dopiero gdy wszyscy mają passkey: `REQUIRE_PASSKEY_FOR_STAFF=1` (+ opcjonalnie `REQUIRE_2FA_FOR_STAFF=1`).

## 10. Produkty w panelu admina

- [ ] Plany hostingowe (`productKind=HOSTING`), ceny, limity, Stripe price ID (jeśli karta).
- [ ] (Opcjonalnie) plany **Poczta e-mail** (`productKind=EMAIL`).
- [ ] (Opcjonalnie) free trial: `trialDays` na wybranych planach.

## 11. Smoke końcowy (na produkcji)

- [ ] Rejestracja klienta → mail weryfikacyjny dochodzi (nie spam).
- [ ] Zakup planu z portfela → konto staje się ACTIVE; dane logowania DA działają.
- [ ] Zakup kartą (Stripe) → webhook aktywuje usługę; faktura wystawiona.
- [ ] Utworzenie skrzynki e-mail + logowanie do webmaila.
- [ ] Rejestracja domeny w checkoucie (OpenProvider) — jeśli włączone.
- [ ] Panel admina → Gotowość do startu LIVE = **GO**.

> Gdy check w panelu pokazuje GO i smoke z pkt 11 przechodzi — można otwierać ruch produkcyjny.
