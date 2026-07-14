# Verris — audyt SEO / GEO (verris.pl + /przenies-strone)

Data: 2026-07-08. Zakres: strona główna i podstrony `apps/www` oraz landing migracyjny.
Cel: maksymalna widoczność w Google (klasyczne SERP + AI Overviews) i cytowalność w AI
(ChatGPT, Perplexity, Gemini). Metodologia: `ai-seo` (GEO/AEO) + standard on-page/tech SEO.

Legenda priorytetów: **P0** = krytyczne (blokuje ranking/UX), **P1** = duży wpływ, **P2** = usprawnienie.

---

## 0. Stan faktyczny (live, zweryfikowany)

Dobre: SSR renderuje `title`, `meta description`, `canonical`, OG + Twitter card; semantyczny HTML
(`<main>`, `<nav>`, `<article>`, hierarchia H1→H3); tabela porównawcza i FAQ na home; unikalne
metadane na podstronach; `sitemap.xml` i `robots.txt` generowane; JSON-LD Organization + WebSite +
Product + FAQPage (home) oraz Product + HowTo + FAQPage (LP); ISR (revalidate 60 s); Consent Mode v2.

---

## 1. P0 — do naprawy natychmiast

### 1.1 `/przenies-strone` nie istnieje (404) — martwe linki w całej witrynie
Landing żyje tylko jako plik `marketing/landing-przenies-strone.html` i **nie jest wdrożony** jako
route w `apps/www`. Tymczasem prowadzą do niego: CTA „Przenieś stronę za darmo" (hero, karta usług,
final), link „Migracja" w stopce, „Policz koszt w kalkulatorze", linki z podstron usług i funkcji.
**Skutek:** kilkanaście martwych linków wewnętrznych (utrata link equity, złe sygnały jakości,
porzucenia konwersji), brak jednej z najważniejszych stron pod intencję „przeniesienie strony na
inny hosting". **Fix:** przenieść LP do apki jako `apps/www/src/app/(frontend)/przenies-strone`
(z metadanymi, JSON-LD HowTo/FAQ, kalkulatorem) albo — szybciej — serwować statyczny plik przez
Caddy/`public`. Rekomendacja: port do route (spójny header/footer, pomiar, brand).

### 1.2 Brak `og:image` (i `twitter:image`)
Żadna strona nie ma obrazka OG. W wynikach społecznościowych i częściowo w Google udostępnienia są
„puste". **Fix:** wygenerować brandowy obrazek OG (1200×630, ciemny motyw + claim „Hosting bez
gwiazdek."), ustawić domyślny w `metadataBase`/layout, a docelowo per-strona (np. dynamiczny
`opengraph-image` w Next dla bloga z tytułem wpisu).

---

## 2. Structured data / mikrodane (P1 — największa dźwignia pod Google i AI)

Obecne: Organization, WebSite, Product (home), Product/HowTo/FAQPage (LP). Do dołożenia:

| Schemat | Gdzie | Po co |
|---|---|---|
| **BreadcrumbList** | wszystkie podstrony (mamy już wizualne okruszki) | okruszki w SERP, lepsza nawigacja botów |
| **BlogPosting / Article** | `/blog/[slug]` | kwalifikacja do rich resultów, cytowalność w AI (autor, data, obraz) |
| **Service** (lub Product+Offer) | `/hosting`, `/vps`, `/domeny`, `/email-marketing`, `/reseller` | encja usługi z ceną/obszarem działania |
| **FAQPage** | podstrony usług i funkcji (dodać sekcje FAQ) | rich results + bloki odpowiedzi pod AI |
| **Organization — wzbogacić** | globalnie | `logo`, `sameAs` (profile社), `contactPoint` (e-mail), `address` (Zielona Góra), `vatID` (NIP 9292069367) |
| **WebSite — SearchAction** | globalnie | sitelinks searchbox (dopiero gdy dodamy wyszukiwarkę na stronie) |
| **Offer — wzbogacić** | Product | `priceValidUntil`, `priceSpecification` (brutto/VAT), `url`, `seller` |

Uwaga compliance: **nie** dodawać `AggregateRating`/`Review` bez realnych, zebranych opinii (fałszywe
oceny = ryzyko kar i bany rich results). Gdy pojawią się prawdziwe opinie (Google/opineo) — wtedy tak.

---

## 3. On-page (P1/P2)

- **Title na home**: „Verris — polski hosting z autoskalowaniem. Hosting bez gwiazdek." (~62 zn.) —
  na granicy ucięcia. Rozważyć skrót do ~55 zn., np. „Hosting z autoskalowaniem — Verris | Hosting bez gwiazdek".
- **H1**: OK i unikalne per strona. Zadbać, by na home H1 zawierał frazę „hosting" (zawiera).
- **Głębia treści na stronach usług**: solidne, ale krótkie pod ranking na konkurencyjne frazy.
  Dołożyć na każdej: sekcję FAQ (3–5 pytań), 1–2 akapity „dla kogo / kiedy wybrać", link do 2–3
  powiązanych wpisów bloga (hub-and-spoke). To też pod AI (bloki 40–60 słów + FAQ).
- **Bloki definicyjne pod GEO**: na `/hosting`, `/funkcje/autoskalowanie`, `/vps` dodać krótką
  definicję w pierwszym akapicie („Autoskalowanie to…") — AI cytuje samowystarczalne odpowiedzi.
- **Tabele porównawcze**: home ma świetną tabelę (33% cytowań AI to porównania). Powielić wzorzec:
  na `/vps` (VPS vs hosting współdzielony), `/hosting/wordpress` (parametry), w blogu.
- **Linkowanie wewnętrzne**: mocne w nawigacji/stopce; brakuje **kontekstowych** linków w treści
  (np. z akapitów home/usług do konkretnych funkcji i wpisów). Dodawać opisowe anchory.
- **Alt teksty obrazów**: kolekcja Media wymusza `alt` (dobrze); na froncie `<img>` cover bloga ma
  `alt`. Pilnować alt w każdej grafice treściowej.

---

## 4. Techniczne SEO (P1/P2)

- **Obrazy = `<img>` bez `width`/`height`** (blog cover, przyszłe grafiki) → ryzyko CLS (Core Web
  Vitals). Fix: `next/image` albo jawne `width`/`height` + `loading="lazy"`.
- **Fonty Google przez `<link>`** — render-blocking. Rozważyć `next/font` (self-host, `display:swap`)
  dla lepszego LCP/CLS.
- **GSAP na LP** (cdnjs) — dodatkowy JS; przy porcie LP rozważyć lżejsze animacje lub lazy-init.
- **`sitemap.xml`**: brak `lastModified`. Dodać (dla wpisów z `updatedAt`, dla statycznych — data
  builda). Priorytety już są.
- **`robots.txt`**: dziś `allow /`, `disallow /admin`. Pod AI-SEO **jawnie dopuścić** boty
  cytujące (GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended, Bingbot); ewentualnie
  blokować tylko czysto treningowe (CCBot) — decyzja Dominika.
- **Machine-readable pod AI-agentów** (przewaga pioniera na PL):
  - **`/pricing.md`** — ustrukturyzowany cennik (pakiet 39/399, stawki autoskalowania, limity)
    dla agentów zakupowych AI.
  - **`/llms.txt`** — co to Verris, dla kogo, linki do kluczowych stron ([llmstxt.org](https://llmstxt.org)).
- **Hreflang**: tylko `pl-PL` — OK (rynek PL). `lang="pl"` ustawione.
- **Wydajność serwera**: ISR 60 s + Caddy — dobre. Zadbać o cache nagłówki dla statycznych assetów.
- **Wyszukiwarka domen w hero** = `GET` na panel — OK; upewnić się, że nie generuje thin-parametrów
  do indeksu (panel jest osobną domeną, więc bez ryzyka).

---

## 5. AI-SEO / GEO (P1) — żeby AI cytowało Verris

Trzy filary (wg badań GEO: cytowanie źródeł +40%, statystyki +37%, klarowność +20%):

1. **Struktura ekstraktowalna**: bloki definicyjne, kroki (HowTo), tabele „X vs Y", FAQ, akapity
   40–60 słów prowadzone bezpośrednią odpowiedzią. Home i LP już to częściowo mają.
2. **Autorytet/cytowalność**: podpisani autorzy z kompetencjami (dodać pole „autor" w kolekcji
   Posts + schema `author`), daty „ostatnia aktualizacja", własne dane (statystyki uptime ze
   `status.verris.pl`, benchmarki) — najmocniejszy sygnał, którego konkurencja nie ma.
3. **Obecność w źródłach trzecich** (marki są 6,5× częściej cytowane z zewnątrz): opinie Google,
   wątki na forach (WebHostingTalk.pl), grupy FB, ewentualnie wpis w bazach/porównywarkach hostingu.
   To osobny task „digital PR" (patrz plan tasków).
4. **Treści o najwyższej cytowalności**: artykuły **porównawcze** (33%) i **przewodniki
   definitywne** (15%) — rdzeń planu bloga. Porównania z konkurencją tylko na weryfikowalnych
   faktach, z datą, bez deprecjonowania (compliance).

---

## 6. Prioryzowana lista działań (do wdrożenia)

| # | Działanie | Priorytet | Szacunek |
|---|---|---|---|
| 1 | Wdrożyć `/przenies-strone` jako route w apce (naprawa martwych linków + LP) | P0 | 0,5 dnia |
| 2 | Domyślny `og:image` + `opengraph-image` dla bloga | P0 | 0,5 dnia |
| 3 | BreadcrumbList JSON-LD na wszystkich podstronach | P1 | 2 h |
| 4 | BlogPosting/Article schema + pole „autor" i „updatedAt" w blogu | P1 | 3 h |
| 5 | Service schema na stronach usług + sekcje FAQ (schema FAQPage) | P1 | 0,5 dnia |
| 6 | Wzbogacić Organization (logo, sameAs, contactPoint, address, vatID) | P1 | 1 h |
| 7 | `/llms.txt` + `/pricing.md` (machine-readable) | P1 | 2 h |
| 8 | `robots.txt` — jawne reguły dla botów AI + `lastModified` w sitemap | P1 | 1 h |
| 9 | Obrazy: `next/image`/wymiary; rozważyć `next/font` | P2 | 0,5 dnia |
| 10 | Bloki definicyjne + linkowanie kontekstowe + tabele na podstronach | P2 | 1 dzień |

Rekomendacja kolejności: **1 → 2 → 3–6 (structured data) → 7–8 → reszta.** Punkty 1–8 są
niskiego ryzyka i dają najwięcej pod Google + AI. Mogę je wdrożyć w apce od ręki po Twoim „ok".

Każdą finalną treść przepuścić przez `marketing:brand-review` (compliance: ceny brutto, Omnibus,
brak green/fałszywych claimów, SLA 99,5%).
