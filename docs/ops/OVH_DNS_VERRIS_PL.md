# DNS `verris.pl` w OVH — co ustawić (VER-3 / MAIL-3)

> **Stan 2026-05-23 (publiczny DNS):** subdomeny panelu → `204.168.174.138`; apex/`www` → parking OVH `213.186.33.5`; MX/SPF → **poczta OVH** (`mx.ovh.com`).  
> **Rekomendacja:** **zostaw nameservery OVH** — nie przenoś całej strefy na NS serwera panelu na start LIVE.

---

## Czy przenosić NS na serwer panelu?

| Opcja | Kiedy | LIVE start |
|--------|--------|------------|
| **Strefa DNS w OVH** (obecne `ns109.ovh.net` / `dns109.ovh.net`) | Panel, API, TLS (Caddy), SPF/DKIM jako rekordy A/TXT | **Tak — to wybieramy** |
| **Własne NS** (`ns1.verris.pl` → IP panelu + BIND/CoreDNS) | Automatyczne strefy dla klientów hostingu, pełna kontrola DNS z produktu | **Nie teraz** — osobny projekt infra, więcej ryzyka i utrzymania |

Przekierowanie „całej domeny” na panel **nie wymaga** własnych NS — wystarczą rekordy w strefie OVH (poniżej).

---

## Gdzie w OVH

1. [OVH Manager](https://www.ovh.com/manager/) → **Domeny** → `verris.pl` → **Strefa DNS** (nie zmieniaj NS, jeśli nie świadomie migrujesz).
2. Edycja rekordów: **Dodaj wpis** / edytuj istniejący.
3. Propagacja: zwykle 5–60 min (TTL 300–3600).

IP control-plane (panel): **`204.168.174.138`**

---

## 1. Rekordy HTTP/HTTPS (Caddy + Let’s Encrypt)

Te subdomeny **powinny** mieć typ **A** → `204.168.174.138` (u Ciebie już tak jest — zweryfikuj):

| Host (pole) | Typ | Cel |
|-------------|-----|-----|
| `panel` | A | `204.168.174.138` |
| `api` | A | `204.168.174.138` |
| `admin` | A | `204.168.174.138` |
| `staff` | A | `204.168.174.138` |
| `status` | A | `204.168.174.138` |
| `grafana` | A | `204.168.174.138` |

**Apex i www (strona główna):**

| Host | Typ | Cel | Uwagi |
|------|-----|-----|--------|
| `@` (`verris.pl`) | A | `204.168.174.138` | Zamiast parkingu `213.186.33.5` — np. landing lub redirect w Caddy (follow-up) |
| `www` | A lub CNAME | `204.168.174.138` lub `panel.verris.pl` | Spójność z regulaminem / marketingiem |

Opcja OVH **Przekierowanie** (HTTP 301): `verris.pl` i `www` → `https://panel.verris.pl` — OK na start, jeśli nie hostujesz osobnej strony na apex.

---

## 2. Poczta wychodząca z panelu (Postfix) — **wymagane zmiany**

Obecnie w strefie jest m.in.:

- **MX** → `mx1.mail.ovh.net` / `mx2` / `mx3` (odbiór w OVH)
- **SPF** → `v=spf1 include:mx.ovh.com -all` (autoryzuje **tylko** OVH, **nie** serwer panelu)

Wysyłka z Postfix na `204.168.174.138` jako `*@verris.pl` przy `-all` i bez `ip4:` w SPF będzie **odrzucana** przez odbiorców.

### Rekordy do dodania / zmiany

| Host | Typ | Wartość |
|------|-----|---------|
| `mail` | A | `204.168.174.138` |
| `@` | TXT (SPF) | patrz poniżej |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; rua=mailto:dominik@hvln.pl; pct=100; adkim=s; aspf=s` |
| `default._domainkey` lub `panel._domainkey` | TXT | klucz z `opendkim-genkey` na serwerze — [`MAIL_DNS_CHECKLIST.md`](./MAIL_DNS_CHECKLIST.md) |

### SPF — warianty

**A) Nadal odbierasz pocztę na skrzynkach OVH** (`kontakt@verris.pl` w OVH):

```
v=spf1 ip4:204.168.174.138 a:mail.verris.pl include:mx.ovh.com ~all
```

Na czas migracji `~all` (soft fail). Po testach mail-tester i braku problemów: `-all` i ewentualnie usunięcie `include:mx.ovh.com` jeśli OVH mail nieużywany.

**B) Cała poczta @verris.pl tylko z panelu** (obecny wariant):

```
v=spf1 ip4:204.168.174.138 ip6:2a01:4f9:c014:da28::1 a:mail.verris.pl -all
```

### Jak ustawić MX w OVH (prawidłowo)

1. Zaloguj się: **OVHcloud Manager** → **Nazwy domenowe** → **verris.pl** → zakładka **Strefa DNS**.
2. **Usuń** wszystkie stare rekordy MX (np. `mx1.mail.ovh.net`, `mx2.mail.ovh.net`, `mx3.mail.ovh.net` oraz **duplikaty** `mail.verris.pl` z priorytetami 1, 5, 100 — zostaw tylko jeden).
3. **Dodaj** jeden rekord:
   - **Typ:** `MX`
   - **Poddomena:** zostaw puste lub `@` (apex domeny `verris.pl`)
   - **Cel / target:** `mail.verris.pl` (kropka na końcu nie jest wymagana w UI OVH)
   - **Priorytet:** `10` (im niższa liczba, tym wyższy priorytet — 10 jest OK)
4. Upewnij się, że istnieje **A** i **AAAA** dla `mail`:
   - `mail` → A → `204.168.174.138`
   - `mail` → AAAA → `2a01:4f9:c014:da28::1`
5. Zapisz. Weryfikacja:

```bash
dig +short verris.pl MX | sort -n
# Oczekiwane (jedna linia):
# 10 mail.verris.pl.
```

**Nie** ustawiaj wielu MX z tym samym hostem i różnymi priorytetami — to nie zwiększa niezawodności, tylko myli diagnostykę.

**Odbiór na panelu (po zmianie MX z OVH):** na serwerze jeszcze brak skrzynek wirtualnych (`virtual_mailbox_maps` puste) i **UFW nie wpuszcza SMTP z internetu** (port 25 tylko z Docker). Do pełnego odbioru: Dovecot + mapy skrzynek + `ufw allow 25/tcp` + UI w admin-panel (MAIL-4). Do tego czasu działa głównie **wysyłka** (API → Postfix).

---

## 3. rDNS (PTR) — **poza OVH**

IP `204.168.174.138` → obecnie `…your-server.de` (Hetzner). W panelu **Hetzner** ustaw PTR na:

```
mail.verris.pl
```

(albo `panel.verris.pl` — ważne, żeby zgadzało się z `myhostname` Postfix: `mail.verris.pl`).

Bez poprawnego PTR deliverability do Gmail/Outlook często spada.

---

## 4. Checklist po zapisaniu w OVH

```bash
dig +short panel.verris.pl A
dig +short mail.verris.pl A
dig +short verris.pl TXT
dig +short _dmarc.verris.pl TXT
dig +short default._domainkey.verris.pl TXT
host 204.168.174.138   # PTR
```

- [ ] Wszystkie subdomeny panelu → `204.168.174.138`
- [ ] SPF zawiera `ip4:204.168.174.138`
- [ ] DKIM TXT opublikowany
- [ ] PTR w Hetzner = `mail.verris.pl`
- [ ] Test: admin → **Poczta (SMTP)** + [mail-tester.com](https://www.mail-tester.com)

---

## 5. Czego **nie** robić na start

- Nie zmieniaj NS na `ns1.verris.pl` wskazujące tylko na BIND na panelu bez runbooka i monitoringu DNS.
- Nie ustawiaj MX na `mail.verris.pl`, dopóki Postfix nie ma skrzynek / aliasów inbound (dla LIVE wystarczy wysyłka + SPF/DKIM).
- Nie zostawiaj SPF `include:mx.ovh.com -all` jeśli wysyłasz z panelu jako `@verris.pl`.

---

## Powiązane

- [`MAIL_DNS_CHECKLIST.md`](./MAIL_DNS_CHECKLIST.md)
- [`POSTFIX_PANEL_RELAY.md`](./POSTFIX_PANEL_RELAY.md)
- `.env.prod.example` — `CADDY_*_DOMAIN`, `AUTH_COOKIE_DOMAIN=.verris.pl`
