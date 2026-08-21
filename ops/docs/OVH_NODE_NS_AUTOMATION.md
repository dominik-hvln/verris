# Automat NS węzła w OVH (glue + strefa)

Panel Verris po akceptacji nowego węzła (`SERVER_APPROVED` → `ACTIVE`) automatycznie
podpina **markowe serwery nazw** dla tego węzła w OVH i przypisuje je do węzła
(`Server.ns1/ns2`). Można też uruchomić to ręcznie z karty węzła
(*Serwery nazw → Automat OVH → Podepnij NS w OVH*). Automat jest **idempotentny** —
ponowne uruchomienie uzgadnia istniejące rekordy.

## Schemat nazw (krótkie, globalne)

Domena bazowa: `HOSTING_NS_BASE_DOMAIN` (domyślnie `verris.pl`).

| Tryb (`HOSTING_NS_NUMBERING`) | Węzeł 1 | Węzeł 2 | Węzeł 3 |
|------------------------------|---------|---------|---------|
| `sequential` (domyślny) | `ns1.verris.pl`, `ns2.verris.pl` | `ns3`, `ns4` | `ns5`, `ns6` |
| `block100` | `ns100`, `ns101` | `ns102`, `ns103` | `ns104`, `ns105` |

Numeracja jest **globalna** w całej platformie (kolejna wolna para). Stary format
`ns1.node-pl-01.verris.pl` nie jest już używany — ponowne uruchomienie automatu na
węźle tworzy krótkie NS i usuwa stare rekordy A/AAAA ze strefy (legacy).

## Co robi automat

1. **Strefa DNS** (`verris.pl`):
   - `A ns1` → IPv4 węzła, `A ns2` → IPv4 węzła (lub `ns3`/`ns4` dla drugiego węzła)
   - `AAAA` — jeśli podano IPv6 węzła
   - `refresh` strefy
2. **Glue records** na domenie `verris.pl` (parametr `host` = **FQDN**, np. `ns1.verris.pl`):
   - glue `ns1.verris.pl` → `[IPv4 (, IPv6)]`
   - glue `ns2.verris.pl` → `[IPv4 (, IPv6)]`
3. **Przypisanie NS** do węzła + opcjonalne usunięcie starych rekordów `ns1.<slug>.*`
4. **DirectAdmin** (przez API admina węzła, gdy DA jest skonfigurowane w panelu Verris):
   - `Admin Settings` → `ns1` / `ns2` w `directadmin.conf` (POST `CMD_ADMIN_SETTINGS`, nie `CMD_API_*` — na DA 1.6x API zwraca 405)
   - `Reseller → Nameservers` → domyślne NS dla nowych kont
   - `MODIFY_USER` (`action=single`) dla **istniejących** kont `ACTIVE` na węźle

> Do czasu uruchomienia własnego klastra PowerDNS oba NS węzła wskazują na ten sam
> węzeł (autorytatywny pojedynczy host).

## Konfiguracja

W `.env.prod` (te same klucze co automat wildcard-TLS **plus** glue — patrz niżej):

```
OVH_ENDPOINT=ovh-eu
OVH_APP_KEY=...
OVH_APP_SECRET=...
OVH_CONSUMER_KEY=...
HOSTING_NS_BASE_DOMAIN=verris.pl
HOSTING_NS_NUMBERING=sequential
```

## Wymagane uprawnienia consumer key (OVH)

Klucz użyty wyłącznie do **certbot / strefy DNS** (`/domain/zone/*`) **nie wystarczy**
do glue — dostaniesz `403 This call has not been granted`.

Wygeneruj consumer key na https://eu.api.ovh.com/createToken/ z dostępem:

```
GET    /domain/zone/*
POST   /domain/zone/*
PUT    /domain/zone/*
DELETE /domain/zone/*

GET    /domain/verris.pl/glueRecord
GET    /domain/verris.pl/glueRecord/*
POST   /domain/verris.pl/glueRecord
POST   /domain/verris.pl/glueRecord/*/update
DELETE /domain/verris.pl/glueRecord/*
```

(lub szersze `GET/POST/PUT/DELETE /domain/*` jeśli wolisz jeden klucz na całą domenę)

Dodatkowo: `GET /auth/time`

Po wygenerowaniu nowego consumer key zaktualizuj `OVH_CONSUMER_KEY` w `.env.prod`
i przeładuj kontener `api`.

## Weryfikacja po uruchomieniu

```
dig +short NS example-konto.pl
dig +short A ns1.verris.pl
dig +short A ns2.verris.pl
```

### Delegacja domeny klienta w OVH (np. `tprstudio.pl` → `ns1.verris.pl`)

OVH przed zapisem NS sprawdza, czy **nameserver odpowiada na porcie 53** z rekordem
strefy domeny. Sam glue + rekordy `A` w strefie `verris.pl` to za mało.

Na węźlu hostingowym muszą być:

1. **Glue** na `verris.pl` (automat Verris) + publiczne `A`/`AAAA` dla `ns1`/`ns2` — OK jeśli `dig +short A ns1.verris.pl` zwraca IP węzła.
2. **Port 53/tcp i 53/udp** otwarty w UFW/firewalld (skrypt `security-hardening-baseline.sh --role node`).
3. **BIND/named** działający (DirectAdmin) — strefa `tprstudio.pl` utworzona na koncie DA.

Test z zewnątrz (musi zwrócić SOA/NS, nie timeout):

```
dig +short SOA tprstudio.pl @ns1.verris.pl
dig +short SOA tprstudio.pl @62.238.0.223
```

Jeśli OVH pisze *„Please ensure that ns1.verris.pl (62.238.0.223) is correctly configured”*,
najczęściej **port 53 jest zablokowany** na węźle albo `named` nie nasłuchuje.

Na węźle (KVM / root):

```bash
ufw allow 53/tcp
ufw allow 53/udp
systemctl enable --now named
dig @127.0.0.1 SOA tprstudio.pl +short
```

W panelu OVH dla `tprstudio.pl` ustaw **oba** NS: `ns1.verris.pl` i `ns2.verris.pl` (nie tylko jeden).

Raport kroków (created/updated/unchanged/skipped/error) widać w panelu zaraz po
kliknięciu „Podepnij NS w OVH" oraz w logu audytu (`NODE_NS_PROVISION`).

Kroki DirectAdmin pojawią się jako osobne linie w raporcie (Admin Settings, domyślne NS,
synchronizacja kont). Wymaga działającego połączenia API do DA (host/port/login key w karcie węzła).

**Ponowne uruchomienie** „Podepnij NS w OVH" jest bezpieczne (idempotentne) — ponownie
uzgodni OVH i DirectAdmin, jeśli wcześniej zostały tylko rekordy glue bez zmiany DA.
