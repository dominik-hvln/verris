# MAIL-4 — Poczta control-plane `@verris.pl` (spec LIVE)

> **Cel:** pełna obsługa skrzynek **zespołu Verris** (admin, staff) i adresów systemowych pod domeną `verris.pl` na serwerze panelu — **nie** skrzynki hostingowe klientów (te zostają w DirectAdmin / produkcie hostingowym).  
> **Zależności:** MAIL-3 (Postfix, SPF, DKIM, DMARC, MX → `mail.verris.pl`), UFW, infrastruktura na `204.168.174.138`.

---

## 1. Zakres produktowy

### W zakresie MAIL-4

| Obszar | Opis |
|--------|------|
| **Adresy systemowe** | `noreply@`, `panel@`, `support@`, `security@`, `rodo@`, `dmarc@`, `billing@` — rezerwacja, routing, audyt |
| **Skrzynki pracowników** | `jan.kowalski@verris.pl` — tworzenie z **admin-panel**, powiązanie z `User` (staff/admin) |
| **Aliasy** | `help@` → `support@` + 2 osoby; wiele aliasów na skrzynkę |
| **Przekierowania** | forward na zewnętrzny email (z potwierdzeniem opt-in) |
| **Odbiór (MX)** | SMTP 25 z internetu → Postfix → Dovecot (Maildir) |
| **Wysyłka** | API (`MailerService`) + opcjonalnie SMTP submission **587** / IMAP **993** dla staff |
| **Webmail + kalendarz** | **[SOGo](https://www.sogo.nu/)** na `https://mail.verris.pl/SOGo` — nie własny webmail w React |
| **Desktop** | IMAP 993 / SMTP 587 — Outlook, Thunderbird, Apple Mail |
| **Panel staff** | Tylko **dane połączenia** (`/staff/mail/connection-info`) — bez skrzynki w przeglądarce Verris |
| **Hasła skrzynek** | Generowane, rotacja, reset przez admina; opcjonalnie SSO (tylko odbiór przez panel bez hasła IMAP) |
| **RBAC** | Tylko `SUPER_ADMIN` / rola „Poczta” zarządza skrzynkami; staff widzi **tylko swoją** skrzynkę |
| **Audyt** | Każda zmiana skrzynki/aliasu/DNS mail w `AuditLog` |
| **Limity** | Rozmiar skrzynki, max aliasów, rate limit wysyłki per skrzynka |
| **Migracja z OVH** | Import istniejących skrzynek (CSV) + instrukcja zmiany MX (już zrobione) |

### Poza zakresem (inne produkty / fazy)

| Element | Gdzie |
|---------|--------|
| Skrzynki **klientów hostingowych** | DirectAdmin + istniejący moduł `hosting-email` |
| Kampanie marketingowe masowe | `MarketingCampaign` + osobny IP/warmup (faza 2) |
| Pełny klient IMAP na mobile | Faza 2 — dokumentacja „użyj Thunderbird / Apple Mail” wystarczy na LIVE |
| Calendar / Contacts CardDAV | Nie |

---

## 2. Architektura

```
Internet ──MX──► Postfix (mail.verris.pl)
                    │
                    ├─ milter: OpenDKIM (podpis wychodzące)
                    ├─ milter: Rspamd (opcjonalnie, antyspam + greylisting)
                    │
                    ├─ virtual_mailbox_maps → Dovecot LMTP / deliver Maildir
                    │
API (MailerService) ──► Postfix (submission 587, SASL) ──► outbound
                    │
Admin-panel ──► API /admin/mail/* ──► DB + sync Postfix maps
Staff-panel ──► API /staff/mail/* ──► Dovecot (IMAP) lub HTTP API skrzynki
```

**Jeden host, jeden IP/IPv6** — bez dodatkowych adresów. Separacja reputacji: adresy systemowe tylko transakcyjne; staff osobne From.

### Komponenty na hoście

| Usługa | Rola |
|--------|------|
| **Postfix** | MTA: odbiór 25, relay wychodzący, submission 587 |
| **Dovecot 2.3** | IMAP 993, LDA, auth (passwd-file lub Lua → API) |
| **OpenDKIM** | Podpis `default` — już jest |
| **Rspamd** (zalecane) | Antyspam inbound + soft scoring outbound |
| **Caddy** | TLS termination dla webmail API (nie dla raw 993 — Dovecot cert) |

### UFW

```bash
ufw allow 25/tcp    # MX inbound
ufw allow 587/tcp   # submission (staff/API)
ufw allow 993/tcp   # IMAPS (opcjonalnie staff)
# 25 z Docker już jest — zostawić
```

---

## 3. Model danych (Prisma)

```prisma
enum ControlPlaneMailboxKind {
  SYSTEM      // noreply@, support@ — nie loguje się przez IMAP
  STAFF       // powiązane z User
  ALIAS_ONLY  // tylko przekierowanie, bez skrzynki
}

enum ControlPlaneMailboxStatus {
  ACTIVE
  SUSPENDED
  PENDING_MIGRATION
}

model ControlPlaneMailbox {
  id            String   @id @default(cuid())
  localPart     String   // np. "jan.kowalski"
  domain        String   @default("verris.pl")
  email         String   @unique // localPart@domain
  kind          ControlPlaneMailboxKind
  status        ControlPlaneMailboxStatus @default(ACTIVE)
  displayName   String?
  userId        String?  @unique // User (staff/admin)
  user          User?    @relation(...)
  quotaMb       Int      @default(1024)
  usedBytes     BigInt   @default(0)
  imapEnabled   Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdById   String?
  passwordHash  String?  // Dovecot {BLF-CRYPT} — tylko STAFF z IMAP
  @@unique([localPart, domain])
}

model ControlPlaneMailAlias {
  id          String @id @default(cuid())
  aliasEmail  String @unique  // help@verris.pl
  targetId    String
  target      ControlPlaneMailbox @relation(...)
  createdAt   DateTime @default(now())
}

model ControlPlaneMailForward {
  id              String @id @default(cuid())
  mailboxId       String
  forwardTo       String  // zewnętrzny email
  confirmedAt     DateTime?
  confirmationToken String?
  keepCopy        Boolean @default(true)
}

model ControlPlaneSystemAddress {
  id        String @id @default(cuid())
  role      String @unique // NOREPLY | SUPPORT | SECURITY | RODO | BILLING | DMARC_RUA
  email     String @unique
  mailboxId String? // opcjonalnie skrzynka zbiorcza
}
```

**Mapowanie Postfix** (generowane z API, deploy hook):

- `/etc/postfix/verris/virtual_mailbox_maps` → `email → Maildir path`
- `/etc/postfix/verris/virtual_alias_maps` → aliasy i forwardy
- `postmap` + `postfix reload` po każdej zmianie (z debounce 2s w workerze)

---

## 4. API (NestJS)

Prefix: `/admin/mailboxes` (guard: admin + permission `MAIL_MANAGE`).

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/admin/mailboxes` | Lista + filtr kind/status |
| POST | `/admin/mailboxes` | Utwórz STAFF lub SYSTEM |
| GET | `/admin/mailboxes/:id` | Szczegóły, aliasy, forwardy, użycie quota |
| PATCH | `/admin/mailboxes/:id` | Status, quota, displayName, powiąż User |
| DELETE | `/admin/mailboxes/:id` | Soft-delete → SUSPENDED, opcjonalnie purge po 30 dni |
| POST | `/admin/mailboxes/:id/reset-password` | Nowe hasło IMAP (email do admina) |
| POST | `/admin/mailboxes/:id/aliases` | Dodaj alias |
| DELETE | `/admin/mailboxes/:id/aliases/:aliasId` | Usuń alias |
| POST | `/admin/mailboxes/:id/forwards` | Forward + wyślij link potwierdzający |
| GET | `/admin/mail/system-addresses` | Mapowanie ról → email |
| PATCH | `/admin/mail/system-addresses` | Zmiana adresu systemowego (walidacja rezerwowych local-part) |
| POST | `/admin/mail/sync-postfix` | Wymuś regenerację map (super admin) |
| GET | `/admin/mail/delivery-log` | Ostatnie N z `EmailLog` + Postfix queue snapshot |

**Staff** (`/staff/mail`):

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/staff/mail/messages` | Skrzynka INBOX (cursor pagination) |
| GET | `/staff/mail/messages/:id` | Treść + załączniki |
| POST | `/staff/mail/send` | Wyślij (przez Postfix jako zalogowany staff) |
| GET | `/staff/mail/me` | Moja skrzynka, quota |

**Integracja `MailerService`:**

- `SMTP_FROM_ADDRESS` per typ maila z `ControlPlaneSystemAddress` (nie jeden globalny).
- Envelope-from = From dla DMARC alignment.

---

## 5. Admin-panel (UI)

Ścieżka: **Ustawienia → Poczta zespołu** (`/settings/team-mail`).

### Widoki

1. **Przegląd** — status Postfix/Dovecot, ostatni DKIM test, liczba skrzynek, link do dokumentacji DNS.
2. **Adresy systemowe** — tabela ról (noreply, support, …) z edycją → walidacja SPF/DKIM nie psuje alignment.
3. **Skrzynki pracowników** — tabela: email, user, quota, status, akcje (reset hasła, zawieś).
4. **Nowa skrzynka** — formularz: local-part, przypisz User (autocomplete staff), quota, „wyślij dane logowania na email prywatny”.
5. **Aliasy i forwardy** — podstrona skrzynki.
6. **Log dostarczeń** — podpięcie `EmailLog` + status kolejki (tylko odczyt).

### Reguły UX (LIVE)

- Nie można usunąć ostatniego `security@` / `noreply@`.
- Local-part: regex `^[a-z0-9][a-z0-9._-]{0,63}$`, zarezerwowane: `postmaster`, `abuse`, `hostmaster`, `mail`, `root`.
- Przy tworzeniu skrzynki dla User bez staff role — blokada.

---

## 6. Staff-panel (webmail LIGHT)

- Menu **Poczta** (tylko jeśli user ma `ControlPlaneMailbox` ACTIVE).
- INBOX / Sent (foldery Maildir), podgląd HTML sanitizowany (DOMPurify).
- Compose: do, temat, treść, załączniki ≤ 10 MB (S3 lub lokalnie w Maildir).
- **Nie** wymaga pełnego klienta MUA — wystarczy obsługa support@ workflow.

Alternatywa równoległa: dane IMAP do konfiguracji w Outlook/Thunderbird (host `mail.verris.pl`, port 993).

---

## 7. Bezpieczeństwo

| Zagadnienie | Implementacja |
|-------------|----------------|
| Open relay | `smtpd_relay_restrictions`, `permit_mynetworks` tylko Docker + localhost; `smtpd_sender_login_maps` |
| Auth 587 | Dovecot SASL lub API token per skrzynka |
| TLS | `smtpd_tls_cert_file` (Let’s Encrypt `mail.verris.pl`) |
| Hasła | min 16 znaków, bcrypt w DB, `{BLF-CRYPT}` dla Dovecot |
| Rate limit | Postfix `smtpd_client_connection_rate_limit`, API `@Throttle` na send |
| Audyt | `MAILBOX_CREATED`, `ALIAS_ADDED`, `SYSTEM_ADDRESS_CHANGED`, … |
| RODO | Usunięcie User → SUSPENDED skrzynka, export Maildir w data export |

---

## 8. Adresy systemowe (domyślne)

| Rola | Email | Użycie w kodzie |
|------|-------|-----------------|
| NOREPLY | `noreply@verris.pl` | Faktury, auto-maile |
| SUPPORT | `support@verris.pl` | Tickety (Reply-To), webmail zespół |
| SECURITY | `security@verris.pl` | `SECURITY_ALERT_EMAIL` |
| RODO | `rodo@verris.pl` | Wnioski RODO |
| BILLING | `billing@verris.pl` | Billing alerts |
| DMARC_RUA | `dmarc@verris.pl` | Opcjonalnie zamiast dominik@ w DMARC |

Rejestr w DB — zmiana bez redeploy env.

---

## 9. Wysyłka transakcyjna (spójność z MAIL-2)

Wszystkie triggery z [`docs/mail/AUDIT.md`](../mail/AUDIT.md) używają:

- From = odpowiedni `ControlPlaneSystemAddress`
- `List-Unsubscribe` tylko MARKETING
- `EmailLog` bez zmian
- Po MAIL-4: test dostarczalności w CI (opcjonalnie) — nagłówek musi mieć `dkim=pass`

---

## 10. Migracja z OVH

1. Eksport skrzynek OVH (CSV: login, forward).
2. Import `/admin/mailboxes/import` (dry-run → commit).
3. MX już na `mail.verris.pl` — po MAIL-4 inbound.
4. Komunikat do zespołu: nowe hasła IMAP / webmail.

---

## 11. Operacje i monitoring

| Metryka | Źródło |
|---------|--------|
| Kolejka Postfix | `postqueue -p`, Prometheus textfile lub skrypt |
| DKIM podpis | log `DKIM-Signature field added` rate |
| Rspamd score | `/var/log/rspamd` |
| Rozmiar Maildir | cron + `du` → quota w DB |
| Alert | Grafana: kolejka > 50, brak DKIM przez 5 min |

---

## 12. Kolejność implementacji (sprinty, wszystko LIVE w swoim obszarze)

| Sprint | Dostarczenie | Gotowe do LIVE gdy |
|--------|--------------|-------------------|
| **4a** | Postfix virtual maps + Dovecot + UFW 25/587 + generator map z API | Odbiór `@verris.pl` działa technicznie |
| **4b** | Admin CRUD skrzynki + system addresses + audyt | Admin zarządza zespołem bez SSH |
| **4c** | SOGo LIVE + staff connection-info + IMAP 993 | Webmail/kalendarz w SOGo; desktop IMAP |
| **4d** | Aliasy, forwardy z potwierdzeniem, import OVH | Migracja zakończona |
| **4e** | Rspamd + tuning deliverability + mail-tester w runbook | SPAM < 1% na testach |

Każdy sprint merge = działający produkcja w swoim zakresie (bez „później włączymy odbiór”).

---

## 13. Kryteria akceptacji MAIL-4

- [ ] MX → mail.verris.pl, jeden rekord w OVH
- [ ] Zewnętrzny test `@verris.pl` → skrzynka w panelu admin/staff
- [ ] Wychodzący mail: SPF + DKIM + DMARC pass (mail-tester ≥ 9)
- [ ] Admin tworzy skrzynkę staff, reset hasła, alias `help@` → `support@`
- [ ] `MailerService` wysyła z `noreply@` / `support@` zgodnie z rolą
- [ ] Audyt i RBAC — klient panelu nie widzi `/admin/mailboxes`
- [ ] Dokumentacja: [`MAIL_DELIVERABILITY.md`](./MAIL_DELIVERABILITY.md), [`OVH_DNS_VERRIS_PL.md`](./OVH_DNS_VERRIS_PL.md)

---

## 14. Powiązanie z backlogiem

Wpis w [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md): **MAIL-4** → ten dokument jako spec źródłowy.
