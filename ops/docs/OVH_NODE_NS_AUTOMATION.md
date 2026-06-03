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
   - `Admin Settings` → `ns1` / `ns2` w `directadmin.conf` (zamiast `*.da.direct`)
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

Raport kroków (created/updated/unchanged/skipped/error) widać w panelu zaraz po
kliknięciu „Podepnij NS w OVH" oraz w logu audytu (`NODE_NS_PROVISION`).

Kroki DirectAdmin pojawią się jako osobne linie w raporcie (Admin Settings, domyślne NS,
synchronizacja kont). Wymaga działającego połączenia API do DA (host/port/login key w karcie węzła).

**Ponowne uruchomienie** „Podepnij NS w OVH" jest bezpieczne (idempotentne) — ponownie
uzgodni OVH i DirectAdmin, jeśli wcześniej zostały tylko rekordy glue bez zmiany DA.
