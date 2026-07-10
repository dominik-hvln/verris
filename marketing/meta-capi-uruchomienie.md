# Meta Conversions API (CAPI) — uruchomienie

Kod jest gotowy i wdrożony wraz z deployem. CAPI zacznie działać, gdy dodasz **token dostępu**
z Menedżera zdarzeń Meta. Bez tokena endpoint po prostu nic nie wysyła (bezpieczny no-op).

## Jak to działa (w skrócie)

Przy zakcie usługi z portfela przeglądarka odpala Pixel `Purchase` z `event_id = purchase-<id>`.
Równolegle panel (server action) woła nasze API, które wysyła **to samo zdarzenie** do Meta CAPI
z **identycznym `event_id`** — Meta scala je w jedno (deduplikacja). Dzięki temu:

- zakupy blokowane przez adblocki/ITP są odzyskane (serwer wysyła je zawsze),
- dopasowanie (EMQ) jest wyższe (IP, User-Agent, `_fbp`, `_fbc`, zahaszowany e-mail).

**Zgoda:** relay uruchamia się WYŁĄCZNIE, gdy użytkownik ma zgodę marketingową. Zanonimizowane
konta (RODO) są pomijane po stronie serwera.

## Krok 1 — wygeneruj token CAPI

1. **business.facebook.com/events_manager** → wybierz źródło **Verris** (`2263705751037556`).
2. Zakładka **Ustawienia** → sekcja **API konwersji** → **„Skonfiguruj bezpośrednią integrację"**
   → wybierz **„Skonfiguruj z Dataset Quality API"** (zalecane) → **„Wygeneruj token dostępu"**.
3. Skopiuj token (długi ciąg). **To sekret — traktuj jak hasło, nie wklejaj publicznie.**

## Krok 2 — dodaj token na serwerze (do `.env.prod`)

Na serwerze, w katalogu `/opt/verris`:

```bash
grep -q '^META_DATASET_ID='  .env.prod || echo 'META_DATASET_ID=2263705751037556'  >> .env.prod
grep -q '^META_CAPI_TOKEN='  .env.prod || echo 'META_CAPI_TOKEN=WKLEJ_TOKEN_TUTAJ'  >> .env.prod

# Kontrola (nie pokazuj tokena nikomu):
grep -E '^META_(DATASET_ID|CAPI_TOKEN)=' .env.prod
```

Podmień `WKLEJ_TOKEN_TUTAJ` na token z kroku 1.

> `META_DATASET_ID` to ID Pixela (2263705751037556). `META_GRAPH_VERSION` ma domyślnie `v21.0` —
> nie musisz go ustawiać.

## Krok 3 — przeładuj serwis api

Token czytany jest przy starcie procesu, więc po dodaniu do `.env.prod`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --force-recreate api
```

(To NIE wymaga override GHCR — `api` ma obraz z GHCR, ale `--no-deps` nie rusza zależności.
Jeśli komenda marudzi o `IMAGE_TAG`, użyj pełnego deployu z pushem albo dodaj
`-f docker-compose.ghcr.yml` z ustawionym `IMAGE_TAG`.)

## Krok 4 — weryfikacja

1. **Menedżer zdarzeń → Testuj zdarzenia** → wpisz `test_event_code` (jeśli chcesz testować bez
   realnego zakupu, ustaw tymczasowo `META_TEST_EVENT_CODE=<kod z Test Events>` w `.env.prod`
   i przeładuj api).
2. Zaakceptuj marketing i zrób testowy zakup usługi z portfela w panelu.
3. W Test Events zobaczysz **Purchase** z dwóch źródeł: **Browser** (Pixel) i **Server** (CAPI),
   scalone jako **jedno** zdarzenie — kolumna **„Deduplikacja"** pokaże, że event_id się zgadza.
4. **Menedżer zdarzeń → Przegląd** → sprawdź, że EMQ Purchase rośnie (cel ≥ 6/10).

Po weryfikacji **usuń** `META_TEST_EVENT_CODE` z `.env.prod` i przeładuj api (inaczej realne
zdarzenia trafiają tylko do testów, nie do produkcji).

## Zakres

CAPI wysyła teraz server-side dwa zdarzenia — **ten sam token obsługuje oba:**

- **Purchase** (z panelu, zakup usługi z portfela) — z zahaszowanym e-mailem zalogowanego usera,
  IP/UA/fbp/fbc. Endpoint autoryzowany.
- **Lead** (z verris.pl, formularze LP `/przenies-strone` i `/kontakt`) — **bez e-maila**, tylko
  parametry techniczne (IP/UA/fbp/fbc). Świadoma decyzja: nie repurposujemy adresów z formularza
  kontaktowego na dopasowanie reklamowe. Endpoint publiczny, pod globalnym rate-limitem.

Oba dedupują się z Pixelem przez identyczny `event_id` i uruchamiają się **wyłącznie po zgodzie
marketingowej**. `InitiateCheckout` na razie tylko z Pixela — dołożymy, jeśli będzie potrzebny.

W Test Events zobaczysz **Purchase** i **Lead** z dwóch źródeł (Browser + Server) scalone jako
jedno zdarzenie. Lead przetestujesz od razu (wyślij formularz kontaktowy po akceptacji marketingu);
Purchase — po testowym zakupie z portfela.

## Bezpieczeństwo / compliance

- Token trzymany wyłącznie w `.env.prod` (jak `STRIPE_SECRET_KEY`), nigdy w repo ani w NEXT_PUBLIC.
- E-mail wysyłany wyłącznie jako **SHA-256** (po normalizacji), nigdy jawnie.
- Relay uruchamiany **tylko po zgodzie marketingowej**; konta zanonimizowane pomijane.
- Wszystko best-effort — błąd CAPI nigdy nie wpływa na zakup ani UI.
