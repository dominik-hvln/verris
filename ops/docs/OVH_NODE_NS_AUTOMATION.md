# Automat NS węzła w OVH (glue + strefa)

Panel Verris po akceptacji nowego węzła (`SERVER_APPROVED` → `ACTIVE`) automatycznie
podpina **markowe serwery nazw** dla tego węzła w OVH i przypisuje je do węzła
(`Server.ns1/ns2`). Można też uruchomić to ręcznie z karty węzła
(*Serwery nazw → Automat OVH → Podepnij NS w OVH*). Automat jest **idempotentny** —
ponowne uruchomienie uzgadnia istniejące rekordy.

## Co robi automat

Dla węzła o slug `<węzeł>` (z nazwy/regionu) i domeny bazowej `HOSTING_NS_BASE_DOMAIN`
(domyślnie `verris.pl`):

1. **Strefa DNS** (`HOSTING_NS_BASE_DOMAIN`):
   - `A  ns1.<węzeł>` → IPv4 węzła, `A  ns2.<węzeł>` → IPv4 węzła
   - `AAAA ns1.<węzeł>` / `AAAA ns2.<węzeł>` → IPv6 (jeśli podane)
   - `refresh` strefy
2. **Glue records** na domenie bazowej:
   - `ns1.<węzeł>.<baza>` → `[IPv4 (, IPv6)]`
   - `ns2.<węzeł>.<baza>` → `[IPv4 (, IPv6)]`
3. **Przypisanie NS** do węzła: `Server.ns1 = ns1.<węzeł>.<baza>`,
   `Server.ns2 = ns2.<węzeł>.<baza>`, `nsProvisionedAt = now`.

> Do czasu uruchomienia własnego klastra PowerDNS oba NS węzła wskazują na ten sam
> węzeł (autorytatywny pojedynczy host). Faza PowerDNS rozłoży je na różne hosty.

## Konfiguracja

W `.env.prod` (te same klucze co automat wildcard-TLS):

```
OVH_ENDPOINT=ovh-eu
OVH_APP_KEY=...
OVH_APP_SECRET=...
OVH_CONSUMER_KEY=...
HOSTING_NS_BASE_DOMAIN=verris.pl
```

Brak kluczy → automat wyłączony (przycisk pokazuje komunikat, NS ustawiasz ręcznie).

## Wymagane uprawnienia consumer key (OVH)

Wygeneruj consumer key z dostępem (https://eu.api.ovh.com/createToken/):

```
GET    /domain/*
POST   /domain/*
PUT    /domain/*
DELETE /domain/*
GET    /domain/zone/*
POST   /domain/zone/*
PUT    /domain/zone/*
DELETE /domain/zone/*
GET    /auth/time
```

(Można zawęzić do konkretnej domeny bazowej zamiast `*`, jeśli wolisz minimalny zakres.)

## Weryfikacja po uruchomieniu

```
dig +short NS <domena-klienta>
dig +short A  ns1.<węzeł>.verris.pl
dig +short AAAA ns1.<węzeł>.verris.pl
```

Raport kroków (created/updated/unchanged/skipped/error) widać w panelu zaraz po
kliknięciu „Podepnij NS w OVH" oraz w logu audytu (`NODE_NS_PROVISION`).
