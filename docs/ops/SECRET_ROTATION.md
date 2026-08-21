# Runbook — rotacja sekretów Verris (#15)

Cel: jeden, praktyczny przewodnik rotacji wszystkich sekretów platformy —
planowej (kadencja) i awaryjnej (podejrzenie wycieku). Aktualizować przy każdej
nowej integracji.

Zasady przewodnie:

- **Zero przestoju przy rotacji.** Gdzie się da, stosujemy nakładanie kluczy
  (dual-key / grace period): dodaj nowy → przełącz → wycofaj stary.
- **Najmniejszy promień rażenia.** Sekret per integracja, nigdy współdzielony
  między środowiskami (test/prod) ani usługami.
- **Ślad.** Każdą rotację odnotuj w `docs/ops/INCIDENT_RESPONSE.md` (przy
  awaryjnej) lub w changelogu deployu (przy planowej): co, kiedy, kto.
- **Sekrety nie żyją w repo.** Tylko w env/secret-store hosta. W bazie wyłącznie
  zaszyfrowane (KMS).

---

## 1. Inwentarz i kadencja

| Sekret (env) | Do czego | Przechowywanie | Promień rażenia | Kadencja | Rotacja bez przestoju |
|---|---|---|---|---|---|
| `JWT_SECRET` | Podpis tokenów sesji API | env API | Wszystkie sesje (wylogowanie globalne przy zmianie) | 180 dni / przy podejrzeniu | Nie* — patrz §3.1 |
| `APP_KMS_KEY` | Szyfrowanie at-rest sekretów w DB (hasła DA, token/klucz KSeF) | env API | Odszyfrowanie danych integracji | 365 dni / przy podejrzeniu | Tak (re-encrypt) — §3.2 |
| `STRIPE_SECRET_KEY` | API Stripe (płatności) | env API | Płatności/portfel | 180 dni / przy podejrzeniu | Tak (roll w Stripe) — §3.3 |
| `STRIPE_WEBHOOK_SECRET` | Weryfikacja webhooków Stripe | env API | Przyjmowanie zdarzeń płatności | Przy zmianie endpointu / podejrzeniu | Tak (dwa sekrety w Stripe) |
| `HETZNER_API_TOKEN` | Provisioning VPS (Hetzner Cloud) | env API | Cykl życia VPS | 180 dni | Tak (nowy token → swap) |
| `OPENPROVIDER_USERNAME/PASSWORD/OWNER_HANDLE` | Rejestracja domen | env API | Operacje domenowe | 180 dni / przy podejrzeniu | Częściowo (zmiana hasła w OP) |
| `OVH_APP_KEY/APP_SECRET/CONSUMER_KEY` | OVH (DNS/registrar) | env API | DNS/domeny | 180 dni | Tak (nowy consumer key) |
| `REGISTRAR_API_TOKEN` | Registrar API | env API | Domeny | 180 dni | Zależnie od dostawcy |
| `SMTP_USER/PASS` | Wysyłka maili (control plane) | env API | Dostarczalność poczty systemowej | 180 dni | Tak (drugie konto SMTP → swap) |
| `AI_API_KEY` | Prognozy/asystent (jeśli włączone) | env API | Funkcje AI (nie-krytyczne) | 365 dni | Tak |
| `METRICS_AUTH_TOKEN` | Ochrona `/metrics` (Prometheus) | env API + scraper | Podgląd metryk | 365 dni | Tak (token w obu) |
| `REDIS_URL` (jeśli z hasłem) | Kolejka BullMQ | env API | Kolejka provisioningu | Przy podejrzeniu | Tak |
| `KSEF_TOKEN`, `KSEF_PUBLIC_KEY_PEM_B64` | KSeF (e-faktury) | DB (szyfr. KMS) + env | Wysyłka faktur do KSeF | Wg polityki MF / podejrzenie | Tak (panel admina) |
| `VPN_SYNC_TOKEN`, `VPN_WG_SERVER_PUBLIC_KEY` | WireGuard control↔nodes | env API + węzły | Łączność VPN floty | 365 dni | Tak (rolling per węzeł) |
| `VERRIS_TLS_DEPLOY_WEBHOOK` | Webhook deploy TLS | env | Deploy certów | Przy podejrzeniu | Tak |
| `VERRIS_NODE_DEPLOY_SSH_PUBKEY` | Klucz SSH deploy na węzły | env + `authorized_keys` węzłów | Dostęp deploy do węzłów | 365 dni / odejście osoby | Tak (dodaj nowy klucz → usuń stary) |
| **Token bootstrap węzła** | Pierwszy handshake nowego węzła | generowany per onboarding | Dołączenie węzła do floty | Jednorazowy (TTL) | n/d — krótkożyciowy |
| **Token agenta węzła** | Autoryzacja agenta `verris-tasks`/probe na węzeł | per węzeł (DB/agent) | Komendy do jednego węzła | 365 dni / kompromitacja węzła | Tak (re-issue per węzeł) |
| **Hasła kont DA** | DirectAdmin per konto klienta | DB (szyfr. KMS) | Pojedyncze konto | Przy podejrzeniu | Tak (CMD_API modify) |

\* `JWT_SECRET` bez wsparcia dual-key w obecnym kodzie — rotacja unieważnia
wszystkie sesje (klienci muszą zalogować się ponownie). Patrz §3.1 i „Dług".

---

## 2. Rotacja planowa — przebieg ogólny

1. Wygeneruj nowy sekret u dostawcy (lub `openssl rand -base64 48` dla własnych).
2. Jeśli integracja wspiera **dwa aktywne klucze** (Stripe, SMTP, OVH consumer,
   metrics): dodaj nowy, wdroż env, zweryfikuj ruch na nowym, dopiero potem
   usuń stary u dostawcy.
3. Jeśli **nie** wspiera (single key): wdroż w oknie najniższego ruchu, miej
   gotowy rollback (poprzednia wartość) i potwierdź działanie od razu po deployu.
4. Zaktualizuj env w secret-store hosta i zrób **rolling deploy** (`ops/scripts/prod-deploy-rolling.sh`).
5. Zweryfikuj (§4). Odnotuj rotację.

---

## 3. Procedury szczegółowe (wybrane)

### 3.1 `JWT_SECRET`
- Skutek: wszystkie aktywne sesje stają się nieważne → globalne wylogowanie.
- Procedura: zmień env → rolling deploy → komunikat dla klientów opcjonalny
  (logowanie ponowne). Passkeys/2FA działają bez zmian.
- Okno: poza godzinami szczytu. Rollback: przywróć stary sekret (sesje sprzed
  rotacji znów ważne, jeśli nie minął TTL).
- Dług: docelowo wsparcie listy kluczy (current+previous) dla rotacji bez
  wylogowania — dopisane w roadmapie dług techniczny.

### 3.2 `APP_KMS_KEY` (re-encryption)
- Sekrety w DB (hasła DA, token/klucz KSeF) są szyfrowane tym kluczem.
- Procedura bez przestoju: tryb dwóch kluczy — odszyfruj starym, zaszyfruj nowym
  w jednorazowym skrypcie migracyjnym (batch po rekordach), trzymając oba klucze
  w env (`APP_KMS_KEY` + `APP_KMS_KEY_PREVIOUS`), następnie usuń stary.
- ⚠️ Nigdy nie zmieniaj `APP_KMS_KEY` bez re-encryptu — inaczej dane staną się
  nieodszyfrowywalne (utrata haseł DA/KSeF).

### 3.3 Stripe (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`)
- Klucz API: w Dashboard Stripe → roll key (Stripe utrzymuje stary przez chwilę)
  → wdroż nowy → potwierdź płatność testową → expire stary.
- Webhook secret: dodaj nowy signing secret obok starego, wdroż, potwierdź
  odbiór zdarzenia, usuń stary.

### 3.4 Token agenta węzła / SSH deploy
- Re-issue per węzeł; agent pobiera nowy przy następnym handshake lub przez
  panel onboardingu. Stary klucz SSH usuwamy z `authorized_keys` po potwierdzeniu
  działania nowego (dodaj → test → usuń).

---

## 4. Weryfikacja po rotacji (checklista)

- API `/readyz` = ok, brak skoku 5xx (Caddy/health).
- Płatność testowa (Stripe) przechodzi; webhook odbierany (log).
- Provisioning testowego VPS (Hetzner) startuje; operacja domenowa (OVH/OP) OK.
- Mail systemowy wychodzi (SMTP) — np. test reset hasła.
- KSeF: status „wysłane" na fakturze testowej (jeśli włączone).
- VPN: węzły online w dashboardzie floty.
- Brak błędów odszyfrowania w logach (KMS).

---

## 5. Rotacja awaryjna (podejrzenie wycieku)

1. Natychmiast rotuj dotknięty sekret (pomiń kadencję).
2. Jeśli `JWT_SECRET` — rotuj (globalne wylogowanie) i wymuś re-login.
3. Jeśli klucz dostawcy — najpierw **unieważnij** u dostawcy, potem wdroż nowy.
4. Przejrzyj `AuditLog` i logi dostępu pod kątem nadużyć w oknie ekspozycji.
5. Otwórz wpis w `INCIDENT_RESPONSE.md`, powiadom zainteresowanych (RODO, jeśli
   dotyczy danych osobowych).

---

## 6. Dług techniczny (do zaplanowania)

- **JWT key-ring** (current+previous) — rotacja bez wylogowania klientów.
- **Widok „wiek sekretów" w adminie** — instrumentacja `rotatedAt` per sekret,
  żeby panel pokazywał, co wymaga rotacji (dziś env nie ma znaczników czasu).
- **Automatyczne przypomnienia** o nadchodzącej kadencji rotacji.
