# Rozpiska: Email Marketing / Newsletter + Publiczne API klienta

Status: SPEC (do akceptacji). Autor: zespół Verris. Data: 2026-06-30.
Zasady projektu obowiązują: 100% LIVE (bez mocków), RODO, „klient zaopiekowany w każdym widoku”, weryfikacja względem realnej dokumentacji/API.

Kolejność realizacji ustalona z właścicielem: najpierw **Program resellera** (osobny dokument/implementacja), te dwa obszary jako rozpiska na później.

---

## A. Email Marketing / Newsletter

### A.1 Po co
Nowy płatny produkt dosprzedażny do istniejącej bazy (hosting + poczta). Klient wysyła newslettery/kampanie z własnej domeny, z naszą dostarczalnością (SPF/DKIM/DMARC + reputacja IP już mamy w module `deliverability`). Konkurencja (cyberFolks „Newsletter”, dhosting) ma to jako add-on — to realny przychód powtarzalny.

### A.2 Zakres MVP (świadomie wąski, ale działający na żywo)
- Listy odbiorców (subskrybenci) z importem CSV i ręcznym dodawaniem.
- Double opt-in (RODO) z mailem potwierdzającym + stroną potwierdzenia.
- Kampanie: edytor (reużyjemy bloki z kreatora stron — mamy już 36 typów bloków → wariant „email-safe” na tabelach), wysyłka natychmiastowa lub zaplanowana.
- Szablony (kilka gotowych + zapis własnych).
- Statystyki: wysłane / dostarczone / otwarcia / kliknięcia / odbicia (bounce) / wypisania.
- Wypis (unsubscribe) jednoklikowy + nagłówek `List-Unsubscribe` (wymóg Gmail/Yahoo 2024).
- Limity wysyłki per plan (anty-nadużycia, ochrona reputacji wspólnych IP).

### A.3 Model danych (Prisma — nowe modele)
```
model MailingList {
  id            String   @id @default(uuid())
  userId        String
  subscriptionId String?  // powiązanie z płatnym produktem newslettera
  name          String
  fromName      String
  fromEmail     String   // musi być na zweryfikowanej domenie klienta (DKIM)
  replyTo       String?
  doubleOptIn   Boolean  @default(true)
  createdAt     DateTime @default(now())
  // relacje: subscribers, campaigns
}

enum SubscriberStatus { PENDING CONFIRMED UNSUBSCRIBED BOUNCED COMPLAINED }

model Subscriber {
  id           String          @id @default(uuid())
  listId       String
  email        String
  name         String?
  status       SubscriberStatus @default(PENDING)
  confirmToken String?         @unique      // double opt-in
  unsubToken   String          @unique      // 1-click unsubscribe
  consentAt    DateTime?                    // RODO: kiedy i jak wyrażono zgodę
  consentSource String?                     // import/form/api
  createdAt    DateTime @default(now())
  @@unique([listId, email])
  @@index([listId, status])
}

enum CampaignStatus { DRAFT SCHEDULED SENDING SENT PAUSED FAILED }

model Campaign {
  id          String         @id @default(uuid())
  listId      String
  subject     String
  preheader   String?
  bodyJson    Json           // bloki (jak kreator), renderowane do email-HTML
  status      CampaignStatus @default(DRAFT)
  scheduledAt DateTime?
  sentAt      DateTime?
  createdAt   DateTime @default(now())
}

model CampaignRecipient {            // ślad wysyłki per odbiorca (statystyki)
  id           String   @id @default(uuid())
  campaignId   String
  subscriberId String
  messageId    String?  @unique      // do korelacji bounce/open/click
  sentAt       DateTime?
  deliveredAt  DateTime?
  openedAt     DateTime?
  clickedAt    DateTime?
  bouncedAt    DateTime?
  unsubAt      DateTime?
  @@index([campaignId])
}
```

### A.4 Wysyłka — realny transport (bez mocków)
- Wysyłamy przez nasz istniejący SMTP poczty (DirectAdmin/Exim na węzłach) **z dedykowaną kolejką** i throttlingiem, albo przez relay z oddzielną pulą IP (rekomendacja: oddzielna pula, żeby kampanie nie psuły reputacji poczty transakcyjnej).
- Open tracking: pixel `GET /e/o/:messageId` (przezroczysty 1×1). Click tracking: przepisanie linków na `GET /e/c/:messageId?u=<enc>` z redirectem 302.
- Bounce/complaint: parsujemy zwroty (Exim logs / VERP `bounce+<messageId>@…`) — scheduler analogiczny do istniejących (`@Cron`), zapis do `CampaignRecipient.bouncedAt` i przejście subskrybenta w `BOUNCED`/`COMPLAINED` (auto-wykluczenie z kolejnych wysyłek).
- `List-Unsubscribe: <https://…/e/u/:unsubToken>, <mailto:…>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (wymóg masowych nadawców).

### A.5 API (NestJS — `mailing` module, account-scoped)
- `GET/POST /mailing/lists`, `GET/POST/DELETE /mailing/lists/:id/subscribers`, import CSV.
- `GET/POST /mailing/campaigns`, `POST /mailing/campaigns/:id/send` (natychmiast/scheduled), `POST /:id/test` (wyślij testowo do siebie).
- `GET /mailing/campaigns/:id/stats`.
- Publiczne (bez auth): `GET /e/o/:id`, `GET /e/c/:id`, `GET/POST /e/u/:token` (unsubscribe), `GET /confirm/:token` (double opt-in).
- Guard: status konta ACTIVE (jak SEC-2), tylko `fromEmail` na domenie z poprawnym DKIM (walidacja przez `deliverability.service`).

### A.6 Panel klienta
- Nowa zakładka w hubie usługi poczty (lub osobny produkt „Newsletter”): Listy / Kampanie / Statystyki / Ustawienia (nadawca, DKIM status).
- Edytor kampanii = kreator bloków w trybie email (tabele, inline CSS), podgląd desktop/mobile, „wyślij test”.
- Kafel zdrowia: status DKIM/SPF, reputacja IP (z `deliverability`), ostrzeżenie gdy bounce-rate > próg.

### A.7 Billing
- Nowy `ProductKind` lub add-on do poczty: model „liczba odbiorców / liczba maili miesięcznie”. Pobór z portfela (mamy `WalletTransaction`) — np. pakiet bazowy + overage. Limity twardzone w API.

### A.8 RODO / anty-spam (krytyczne)
- Double opt-in domyślnie ON; przechowujemy `consentAt`/`consentSource` (dowód zgody).
- Eksport/usuwanie subskrybentów w ścieżce RODO (dopiąć do istniejącego `compliance`/`AccountDeletionRequest`).
- Stopka z adresem nadawcy + link wypisu (wymóg prawny).
- Throttling + reputacja: limit nadużyć, auto-pauza kampanii przy wysokim bounce/complaint.

### A.9 Etapy
1. Modele + migracja + `mailing` module (listy/subskrybenci + double opt-in).
2. Kampanie + render email-HTML z bloków + wysyłka przez kolejkę z throttlingiem.
3. Tracking (open/click/unsub) + bounce scheduler + statystyki.
4. Panel klienta (edytor + statystyki + zdrowie).
5. Billing/limity + RODO + hardening reputacji.

---

## B. Publiczne API klienta + tokeny

### B.1 Po co
Agencje i deweloperzy chcą automatyzować (Terraform/CI, własne panele odsprzedaży, integracje). To także fundament pod **Program resellera** (reseller woła nasze API). Konkurencja ma API (home.pl, OVH) — brak go u nas to bariera dla klientów technicznych.

### B.2 Zasada bezpieczeństwa
- Token = sekret pokazany **dokładnie raz**, w bazie tylko hash (argon2/bcrypt) + prefiks do identyfikacji (`vrs_live_abcd…`). Wzorujemy się na istniejącym `UserAuthToken`/passkey podejściu (hash, nie plaintext).
- Scopes (uprawnienia minimalne): np. `services:read`, `dns:write`, `mail:write`, `billing:read`, `mailing:write`. Brak scope’a = 403.
- Nigdy nie wystawiamy przez API: impersonacji, zmiany ról, operacji destrukcyjnych na cudzych zasobach. Token działa **wyłącznie w obrębie konta właściciela** (account-scoped), nigdy ADMIN.
- Rate-limit per token (mamy już `@nestjs/throttler` z ETAP 5) + audyt każdego wywołania (`AuditLog`).

### B.3 Model danych
```
model ApiToken {
  id          String   @id @default(uuid())
  userId      String
  name        String                 // „CI deploy”, „Terraform”
  prefix      String   @unique       // widoczny fragment do identyfikacji
  hash        String                 // argon2(token)
  scopes      String[]               // lista scope’ów
  lastUsedAt  DateTime?
  lastUsedIp  String?
  expiresAt   DateTime?              // opcjonalny TTL
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  @@index([userId])
}
```

### B.4 Uwierzytelnianie
- Nagłówek `Authorization: Bearer vrs_live_…`. Nowa strategia Passport (`ApiTokenStrategy`) obok JWT: rozpoznaje prefiks, znajduje token po `prefix`, weryfikuje hash, sprawdza `revokedAt`/`expiresAt`, ładuje usera (musi być ACTIVE, nie `loginBlocked`).
- Guard scope: dekorator `@ApiScope('dns:write')` — analogicznie do `@StaffPerm`.

### B.5 Powierzchnia API v1 (wersjonowane `/api/v1/...`)
- `GET /services` — lista usług klienta (read).
- `GET /services/:id` — szczegóły + status.
- DNS: `GET/POST/PUT/DELETE /services/:id/dns` (reużycie istniejącego DNS managera).
- Mail: `GET/POST/DELETE /services/:id/mailboxes`, forwardery/autorespondery (mamy w SDK).
- Billing: `GET /billing/wallet`, `GET /invoices`, `GET /invoices/:id.pdf` (read-only).
- Mailing (gdy powstanie): `POST /mailing/campaigns…`.
- Wszystko mapowane na istniejące serwisy — API to cienka warstwa nad tym, co już działa w panelu.

### B.6 Webhooki
```
model WebhookEndpoint {
  id        String   @id @default(uuid())
  userId    String
  url       String
  secret    String              // HMAC do podpisu payloadu
  events    String[]            // service.provisioned, invoice.paid, monitor.down…
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
}
```
- Dostawa z podpisem `X-Verris-Signature: sha256=…` (HMAC), retry z backoffem (scheduler jak inne), log dostaw.
- Event bus: emitujemy z istniejących miejsc (provisioning done, invoice paid, monitor down — już mamy te zdarzenia/emitery dzwonka z FIN-1).

### B.7 Panel klienta
- Zakładka „API i integracje”: lista tokenów (prefiks, scopes, ostatnie użycie), „Utwórz token” (sekret pokazany raz, kopiuj), „Unieważnij”. Webhooki: dodaj URL + zdarzenia + test delivery. Link do dokumentacji.
- Bezpieczeństwo: tworzenie/unieważnianie tokenu = alert e-mail + wpis w historii (jak przy passkey).

### B.8 Dokumentacja
- OpenAPI (Swagger — NestJS `@nestjs/swagger`) generowane z kontrolerów `/api/v1`. Publiczny portal `docs.verris.pl/api`.

### B.9 Etapy
1. `ApiToken` model + migracja + `ApiTokenStrategy` + guard scope + panel (CRUD tokenów).
2. Wersjonowany `/api/v1` read-only (services, billing, invoices) + rate-limit + audyt + OpenAPI.
3. Operacje zapisu (DNS, mail) ze scope’ami.
4. Webhooki (model + dostawa HMAC + retry + panel + emitery zdarzeń).

---

## C. Zależności i kolejność
- **Reseller** (priorytet właściciela) korzysta z części B (account-scoped API) oraz z mechaniki prowizji/portfela. Budujemy reseller jako pierwszy; API publiczne i email marketing wg powyższych rozpisek po nim.
- Wszystkie trzy obszary dotykają billingu (portfel/`WalletTransaction`) i RODO — przy każdym dopinamy eksport/usuwanie danych i audyt.
