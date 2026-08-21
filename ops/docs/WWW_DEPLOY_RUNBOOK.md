# Runbook — wdrożenie verris.pl (apps/www) na produkcję

Strona marketingowa jedzie tym samym torem co panele: push na `main` → GitHub Actions
buduje obraz `verris-www` → GHCR → serwer pobiera i uruchamia. Poniżej komplet kroków.

> Legenda: **[LOKALNIE]** = Twój komputer (repo), **[SERWER]** = control-plane po SSH,
> katalog z `docker-compose.prod.yml` i `.env.prod`.

---

## 0. Wymagania wstępne (DNS)

Rekordy A muszą wskazywać na IP serwera control-plane (inaczej Let's Encrypt nie wystawi
certyfikatu). Ustaw u operatora DNS:

```
verris.pl.        A   <IP_SERWERA>
www.verris.pl.    A   <IP_SERWERA>
```

Sprawdź propagację **[LOKALNIE]**:

```bash
dig +short verris.pl A
dig +short www.verris.pl A
```

---

## 1. PAYLOAD_SECRET — wygeneruj i dodaj do `.env.prod`  [SERWER]

Sekret podpisuje tokeny/pola Payloada. Ustaw go RAZ i już nie zmieniaj (zmiana unieważnia
istniejące tokeny). 64 znaki hex = mocny sekret.

```bash
cd /opt/verris        # katalog repo z .env.prod (dostosuj ścieżkę)

# Dodaj tylko jeśli jeszcze go nie ma (idempotentnie):
grep -q '^PAYLOAD_SECRET=' .env.prod || echo "PAYLOAD_SECRET=$(openssl rand -hex 32)" >> .env.prod

# Podejrzyj, że jest (nie pokazuj nikomu):
grep '^PAYLOAD_SECRET=' .env.prod
```

Chcesz wygenerować sekret bez zapisu (np. by wkleić ręcznie)? `openssl rand -hex 32`.

---

## 2. Domeny dla Caddy — dodaj do `.env.prod`  [SERWER]

To NIE jest osobny plik Caddy — compose wstrzykuje te zmienne do kontenera caddy.

```bash
grep -q '^CADDY_WWW_DOMAIN='          .env.prod || echo 'CADDY_WWW_DOMAIN=verris.pl'              >> .env.prod
grep -q '^CADDY_WWW_REDIRECT_DOMAIN=' .env.prod || echo 'CADDY_WWW_REDIRECT_DOMAIN=www.verris.pl' >> .env.prod

# Kontrola:
grep -E '^CADDY_WWW' .env.prod
```

---

## 3. Zmienne GitHub Actions (GTM / Meta Pixel)  [LOKALNIE]

NEXT_PUBLIC_* są wpalane do bundla na etapie `next build`, więc muszą być jako repo Variables.
Przez `gh` CLI:

```bash
gh variable set GTM_ID        --body "GTM-PJQNXCF5"
gh variable set META_PIXEL_ID --body ""      # wpisz realny ID, gdy Pixel będzie gotowy
```

(albo GitHub → Settings → Secrets and variables → Actions → **Variables**.)

---

## 4. Wypchnij kod → automatyczny build + deploy  [LOKALNIE]

Najpierw upewnij się, że kroki 1–2 są zrobione na serwerze (deploy czyta `.env.prod`).

```bash
git add -A
git commit -m "feat(www): strona marketingowa verris.pl (Next.js + Payload) + deploy"
git push origin main
```

Push uruchamia workflow `Deploy (control-plane)`: zbuduje `verris-www`, wypchnie do GHCR
i przez SSH odpali `prod-deploy-ghcr.sh` (pull + `up -d` serwisu `www`, health-gate + rollback).
Podgląd w GitHub → Actions.

---

## 5. Odtwórz kontener Caddy (podłapanie nowych domen)  [SERWER]

Skrypt deployu rusza tylko apki (`www` już jest na liście), ale **nie** rusza Caddy.
Zmiana env kontenera wymaga jego odtworzenia — zrób to raz:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml --env-file .env.prod up -d caddy
```

Caddy wczyta blok `verris.pl` z zaktualizowanego `ops/caddy/Caddyfile` i automatycznie
wystawi certyfikat Let's Encrypt (DNS z kroku 0 musi już działać).

---

## 6. Weryfikacja  [SERWER / LOKALNIE]

```bash
# kontener www zdrowy?
docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml --env-file .env.prod ps www
docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml --env-file .env.prod exec www curl -fsS http://127.0.0.1:3005/healthz

# publicznie (po wystawieniu certu):
curl -I https://verris.pl
curl -I https://www.verris.pl        # 301 → https://verris.pl
```

Strony publiczne (home, /hosting, /vps, /domeny, /funkcje, /cennik, /pomoc, /o-nas, /kontakt)
działają **bez bazy**. Blog pokaże pusty stan, a `/admin` czeka na schemat Payloada (krok 7).

---

## 7. Migracje Payload — zautomatyzowane w deployu

**Od teraz nie robisz nic ręcznie.** `prod-deploy-ghcr.sh` odpala `ops/scripts/prod-migrate-www.sh`
**przed** startem nowego obrazu `www`, więc schemat zawsze wyprzedza kod (expand → contract).
Nieudana migracja **przerywa deploy** zanim kod zostanie podmieniony — stary kod i stary schemat
działają dalej.

Dlaczego tak: obraz `www` jest „standalone" i nie zawiera CLI Payloada, dlatego migracja idzie
z jednorazowego kontenera `node:22-bookworm-slim` z zamontowanym repo, podpiętego do sieci
`verris_internal`. Połączenie przez zmienne `PG*` (bez enkodowania hasła w URL).

Ręczne odpalenie (debug / pierwsza inicjalizacja):

```bash
cd /opt/verris && bash ops/scripts/prod-migrate-www.sh
```

Jeśli po deployu blog albo `/admin` wyglądają na puste, sprawdź najpierw logi — błąd bazy
(np. `column ... does not exist`) jest teraz logowany, a nie maskowany jako „brak wpisów":

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=60 www | grep -i "error\|column"
```

<details>
<summary>Wariant historyczny — ręczna migracja z jednorazowego kontenera</summary>

```bash
# Nazwa wewnętrznej sieci (zwykle <katalog>_verris_internal):
NET=$(docker network ls --format '{{.Name}}' | grep verris_internal | head -1); echo "$NET"

# Hasło do bazy z .env.prod:
PGPASS=$(grep '^POSTGRES_PASSWORD=' .env.prod | cut -d= -f2-)
PSECRET=$(grep '^PAYLOAD_SECRET=' .env.prod | cut -d= -f2-)

docker run --rm -i --network "$NET" -v "$PWD":/repo -w /repo/apps/www \
  -e DATABASE_URI="postgres://verris:${PGPASS}@postgres:5432/verris_db" \
  -e PAYLOAD_SECRET="${PSECRET}" \
  node:22-bookworm bash -lc '
    corepack enable &&
    pnpm install --filter @verris/www... --frozen-lockfile &&
    pnpm --filter @verris/www exec payload migrate:create initial &&
    pnpm --filter @verris/www exec payload migrate'
```

</details>

Konto admina zakładasz przy pierwszym wejściu na `https://verris.pl/admin`.

> Uwaga bezpieczeństwa: `/admin` jest publiczny (login-gated). Jeśli ma być niedostępny z
> zewnątrz, dodaj w Caddy ograniczenie (VPN/basic-auth) dla ścieżki `/admin` — `robots.txt`
> już wyklucza go z indeksu.

---

## Rollback

Deploy ma auto-rollback przy nieudanym health-check. Ręcznie: ustaw poprzedni `IMAGE_TAG`
i `compose up -d --no-build www` (patrz `ops/scripts/prod-deploy-ghcr.sh`).
