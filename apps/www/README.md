# @verris/www — verris.pl (Next.js + Payload CMS)

Strona główna i marketingowa Verris. Nowa apka w monorepo (`apps/www`), renderowana
przez **Next.js** (App Router, SSR/SSG pod SEO) z osadzonym **Payload CMS 3**
(panel edycji + REST/GraphQL API w tej samej apce).

## Dlaczego taki stack

- **Payload osadzony w Next.js** — jedna apka, TypeScript end-to-end, brak osobnego serwisu CMS.
- **Postgres** (ten sam, którego używa Prisma) — Payload trzyma swoje tabele w osobnym
  schemacie `payload`, więc nie koliduje z migracjami `@verris/database`.
- **Self-hosted na Hetznerze** — treści i dane w EOG (RODO), spójne z filozofią Verris.

> Uwaga o wersji Next: panele w monorepo używają Next 16. `apps/www` jest przypięte do
> **Next 15.4** dla zgodności z Payload 3. Gdy Payload oficjalnie wesprze Next 16, można podnieść.

## Uruchomienie lokalne

```bash
cp apps/www/.env.example apps/www/.env       # uzupełnij DATABASE_URI i PAYLOAD_SECRET
pnpm install
pnpm --filter @verris/www dev                # http://localhost:3005
```

- Strona: `http://localhost:3005/`
- Panel CMS: `http://localhost:3005/admin` (przy pierwszym wejściu tworzysz konto admina)
- REST API: `/api`, GraphQL: `/api/graphql`

Po pierwszym starcie Payload wygeneruje typy i importMap:

```bash
pnpm --filter @verris/www generate:types
pnpm --filter @verris/www payload generate:importmap
```

## Struktura

```
apps/www/
├─ payload.config.ts            # kolekcje, globalsy, adapter Postgres (schemaName: payload)
├─ src/
│  ├─ collections/              # Users, Media, Pages, Posts (blog), Services
│  ├─ globals/                  # SiteSettings, Navigation, Footer, Pricing
│  ├─ lib/analytics.ts          # warstwa zdarzeń (dataLayer) + Consent Mode v2
│  └─ app/
│     ├─ (frontend)/            # strona publiczna: layout, globals.css, page.tsx, components/
│     └─ (payload)/             # panel /admin + API (generowane wg konwencji Payload)
└─ public/pattern.svg           # brandowy pattern (glif ~28 px, krycie ~6% — reguła marki)
```

Homepage renderuje się statycznie (`force-static`) i **działa bez bazy**. CMS (globalsy
`Navigation`/`Footer`/`Pricing`, kolekcje `Pages`/`Posts`/`Services`) jest gotowy do
podpięcia treści — kolejny krok to zasilenie komponentów danymi z Payload zamiast stałych.

### Strony (routy)

Struktura wielostronicowa wg `marketing/verris-site-architecture.md`:

```
/                         Home
/hosting                  Hosting z autoskalowaniem (pillar)
/hosting/wordpress        Hosting WordPress (SEO)
/hosting/sklep            Hosting pod sklep / WooCommerce (SEO)
/poczta                   Poczta e-mail w hostingu
/vps                      VPS
/domeny                   Domeny
/email-marketing          E-mail marketing
/reseller                 Program resellerski
/funkcje                  Funkcje (hub)
/funkcje/[slug]           Autoskalowanie, migracja, ssl, kopie-zapasowe,
                          analityka-bez-cookies, rodo-i-dpa, sla (mapa treści w lib/features.ts)
/cennik                   Cennik (komponent Pricing)
/blog                     Blog (lista z kolekcji Posts)
/blog/[slug]              Wpis (Lexical RichText)
/pomoc                    Pomoc / FAQ
/o-nas                    O nas
/kontakt                  Kontakt (formularz → generate_lead)
/sitemap.xml, /robots.txt Generowane (app/sitemap.ts, app/robots.ts)
```

Nawigacja (mega menu + mobile) i stopka mają jedno źródło: `src/lib/site.ts`.
Blog jest jedyną częścią zasilaną z Payload — reszta to treść SEO w kodzie (szybka, wersjonowana w Git).
Baner zgód cookie (`ConsentBanner`) jest widoczny site-wide do czasu decyzji użytkownika.

## Pomiar (Consent Mode v2 + GTM)

Wszystko idzie przez **GTM (GTM-PJQNXCF5)** jako hub. Consent Mode v2 domyślnie `denied` —
tagi GA4 / Google Ads / Meta Pixel odpalają się **wyłącznie po zgodzie** (baner cookies).

Schemat zdarzeń `dataLayer` (identyczny na verris.pl i na LP `/przenies-strone`):

| Zdarzenie dataLayer | GA4 | Google Ads | Meta Pixel |
|---|---|---|---|
| `cta_click` `{cta_location, page}` | cta_click (custom) | — | — |
| `generate_lead` `{method, currency}` | generate_lead | Lead | Lead |
| `begin_checkout` `{plan, value, currency}` | begin_checkout | Begin checkout | InitiateCheckout |
| `search` `{search_term}` | search | — | Search |
| `page_view` `{page_path}` | page_view (SPA) | — | PageView |

Konwersje `sign_up`, `purchase` (PLN) i `stripe_checkout_success` powstają w `panel.verris.pl`
(dół lejka) — tu wysyłamy górę lejka. Mapowanie zdarzeń → tagów konfiguruje się raz w GTM.

Zmienne (`.env`): `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`,
`NEXT_PUBLIC_META_PIXEL_ID` (Meta najlepiej wpiąć w GTM; hardcode tylko gdy podasz ID —
baza Pixela startuje z `consent revoke` do czasu akceptacji).

## Compliance (twarde)

- Ceny brutto PLN; „bez limitu" zawsze z notą fair use (realny limit = zasoby konta).
- Brak green claims (ECO = nazwa funkcji, nie twierdzenie środowiskowe).
- SLA 99,5% (nie 100%); rekompensaty = kredyty wg regulaminu.
- `alt` wymagany w kolekcji Media (EAA). Każdą treść przed publikacją → `marketing:brand-review`.

## Wdrożenie (GitOps — tym samym torem co panele)

Push na `main` → GitHub Actions (`.github/workflows/deploy.yml`) buduje obraz `verris-www`
z `Dockerfile.panel` (`APP_NAME=www`, `APP_PORT=3005`), wypycha do GHCR, a serwer pobiera
obraz i robi `docker compose up` (health-gate + rollback). Serwis `www` jest w
`docker-compose.prod.yml` oraz `docker-compose.ghcr.yml`; Caddy serwuje apex `verris.pl`.

Przed pierwszym deployem:

- **GitHub Variables** (już używane przez panele): `GTM_ID`, `META_PIXEL_ID` (opcjonalnie).
  NEXT_PUBLIC_* są wpalane do bundla na etapie `next build`, więc idą jako build-arg.
- **`.env.prod` na serwerze**: `PAYLOAD_SECRET` (długi, losowy) + istniejące `POSTGRES_*`.
  Serwis `www` składa `DATABASE_URI` z `POSTGRES_*` i używa osobnego schematu `payload`.
- **Caddy**: ustaw `CADDY_WWW_DOMAIN=verris.pl` i `CADDY_WWW_REDIRECT_DOMAIN=www.verris.pl`
  (dziś apex serwuje stronę zastępczą `ops/hosting-default-page`).
- **Payload — migracja bazy** (raz): `pnpm --filter @verris/www payload migrate`
  (lub `payload migrate:create` → commit → `migrate`). Do czasu migracji publiczne strony
  działają (blog pokazuje pusty stan), a `/admin` czeka na schemat.
- **`/admin` (panel CMS)** jest login-gated; jeśli ma nie być publiczny — ogranicz w Caddy
  (VPN / basic-auth / rate-limit). `robots.txt` już go wyklucza.

Healthcheck: `/healthz` (nie `/api/health` — `/api/*` należy w tej apce do Payload).
