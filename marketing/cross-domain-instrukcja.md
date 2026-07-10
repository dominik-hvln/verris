# Pomiar `verris.pl` ↔ `panel.verris.pl` — co zrobiłem w kodzie, co Ty klikasz w konsolach

Data: 2026-07-10

---

## Sprostowanie: to nie jest cross-domain

W poprzednim dokumencie nazwałem to „cross-domain" i oznaczyłem jako krytyczne. Połowa tego była
nadmiarowa. `panel.verris.pl` to **subdomena** `verris.pl`, a nie osobna domena.

Konsekwencje, sprawdzone w kodzie:

- GA4 z `cookie_domain: 'auto'` (domyślne) zapisuje `_ga` na domenie rejestrowalnej `verris.pl`.
  Ciasteczko jest współdzielone z każdą subdomeną. **Linker cross-domain nie jest potrzebny.**
- Z tego samego powodu **nie potrzeba wykluczeń odsyłających** (referral exclusions) — sesja nie
  pęka przy przejściu na panel, bo `_ga` i `_ga_XXX` przetrwają.
- `_gcl_au` (Google Ads) i `_fbp` (Meta) też są ustawiane na domenie rejestrowalnej.
- Oba projekty budują się z **tym samym `NEXT_PUBLIC_GTM_ID`** (`.github/workflows/deploy.yml`,
  build args dla `verris-client-panel` i `verris-www`). Ten sam kontener GTM — warunek spełniony.

## Prawdziwy błąd — i on był realny

Ciasteczko zgody `cookies_consent` zapisywało się **bez atrybutu `Domain`**:

```
cookies_consent={...}; expires=...; path=/; SameSite=Lax; Secure
```

Bez `Domain` ciasteczko jest **host-only**. Zgoda wyrażona na `verris.pl` nie była widoczna na
`panel.verris.pl`. Skutek łańcuchowy:

1. Klient akceptuje cookies na stronie marketingowej.
2. Przechodzi do panelu, żeby kupić hosting.
3. Panel nie widzi zgody → pokazuje baner **drugi raz**.
4. Dopóki klient nie kliknie ponownie, Consent Mode zostaje `denied`.
5. `sign_up` i `purchase` **nigdy nie docierają** do GA4, Google Ads ani Meta.

Kampania wygląda, jakby nie konwertowała. To była najdroższa linijka w całym pomiarze.

### Poprawka (zrobione)

`apps/www/src/lib/cookie-consent.ts` i `apps/client-panel/src/lib/cookie-consent.ts` — dodana funkcja
`consentCookieDomain()` wyliczająca `.verris.pl` z `location.hostname`, oraz zapis:

```
cookies_consent={...}; path=/; Domain=.verris.pl; SameSite=Lax; Secure
```

Szczegóły implementacji:

- Dla `localhost`, adresów IP i pojedynczych labeli funkcja zwraca `''` → zapis host-only, jak dotąd.
  Dev i podglądy działają bez zmian.
- Przed zapisem kasujemy starszy wariant host-only. Bez tego po wdrożeniu istniałyby dwa ciasteczka
  o tej samej nazwie i różnym zakresie; `document.cookie` nie ujawnia zakresu, więc `readConsent()`
  trafiałby na przypadkowe. Ten szczegół jest łatwy do przeoczenia i powoduje „zgoda znika po powrocie".

### Jak to sprawdzić po wdrożeniu

1. Wejdź na `https://verris.pl`, zaakceptuj tylko **analitykę** (odznacz marketing).
2. DevTools → Application → Cookies → `https://verris.pl` → `cookies_consent` ma kolumnę
   `Domain` = `.verris.pl`. Jeśli widzisz `verris.pl` bez kropki — poprawka nie weszła.
3. Przejdź na `https://panel.verris.pl`. **Baner nie może się pokazać.**
4. Zakładka Network, filtr `facebook`. Nie może być ani jednego żądania — odmówiłeś marketingu.
5. Filtr `google-analytics` lub `/g/collect`. Żądania są, bo analitykę zaakceptowałeś.

Punkt 4 to jedyny test w całej konfiguracji, którego niezaliczenie może kosztować karę.

---

## Co musisz ustawić ręcznie (kodem się tego nie zrobi)

### GA4

1. **Admin → Data Streams → Web** — jeden strumień dla `verris.pl`. Nie twórz drugiego dla panelu;
   subdomeny należą do tego samego strumienia.
2. **Configure tag settings → Show all → Define internal traffic** — dodaj swoje IP, żeby własne
   wizyty nie zaśmiecały danych.
3. **Enhanced measurement** — włączone. Daje `scroll` (tylko 90%), `click` (wychodzące),
   `file_download`, `video_*`. Progi 25/50/75 dorabiamy w GTM.
4. **Custom definitions → Create custom dimension** — bez tego parametry nie trafią do raportów.
   Zarejestruj jako Event-scoped: `cta_location`, `plan`, `method`, `search_term`, `scroll_depth`.
5. **Admin → Events → Mark as key event**: `generate_lead`, `sign_up`, `purchase`.
   Sprawdź, czy `begin_checkout` da się oznaczyć — jeśli nie, patrz `setup-pomiaru-i-kampanii.md` §3.4.

### Google Ads

1. **Tools → Linked accounts → Google Analytics (GA4)** — połącz, zaznacz import konwersji
   i import audiencji.
2. **Auto-tagging: włączone** (Settings → Account settings → Auto-tagging). Bez tego `gclid`
   nie dolatuje i atrybucja się rozjeżdża.
3. **Tools → Conversions → Import → GA4** — zaimportuj `purchase` i `generate_lead`.
   `purchase` ustaw jako **Primary** (do bidowania), `generate_lead` jako **Secondary** (do obserwacji),
   dopóki nie masz wolumenu.
4. **Dodatkowo utwórz natywny tag konwersji Google Ads** dla `purchase` i odpal go z GTM równolegle
   do importu z GA4. Natywny jest odporny na zmiany po stronie GA4. Bidowanie oprzyj na nim.
5. **Enhanced Conversions** — dopiero po wdrożeniu haszowanego e-maila w `user_data` (TODO w kodzie).

### Meta

1. **Business Manager → Brand Safety → Domains** — zweryfikuj `verris.pl` (rekord TXT w DNS).
   Bez weryfikacji nie skonfigurujesz Aggregated Event Measurement.
2. **Events Manager → Aggregated Event Measurement** — ustaw priorytety zdarzeń.
   Kolejność: `Purchase` → `InitiateCheckout` → `Lead` → `CompleteRegistration` → `ViewContent`.
3. **Controller Addendum** — zaakceptuj w Business Managerze, zanim uruchomisz Custom Audiences.
   Custom Audiences to współadministrowanie danymi.
4. **Deduplikacja Pixel ↔ CAPI** — wymaga `event_id` w dataLayer (TODO w kodzie).
   Bez tego każdy zakup policzy się **dwa razy**, przeszacujesz ROAS i dosypiesz budżet do kampanii,
   która nie zarabia.

### GTM — czego brakuje w kontenerze

| Element | Typ | Uwaga |
|---|---|---|
| Consent Initialization | trigger | musi być pierwszy; kod już ustawia default denied |
| `cta_click` | tag GA4 event | parametry: `cta_location`, `page` |
| `generate_lead` | tag GA4 event | dodaj `value` i `currency` — patrz §3.4 runbooka |
| `scroll_depth` | trigger + tag | progi 25/50/75/90 |
| `form_start` | trigger | pierwszy focus w formularzu; mierzy porzucenia |
| Meta Pixel | tag custom HTML | wyzwalany dopiero po zgodzie marketingowej |
| `consent_state` | zmienna DL | do debugowania, czemu tag nie odpalił |

---

## Kolejność

1. Wdroż poprawkę ciasteczka (jest w kodzie, czeka na push).
2. Przejdź test 5-punktowy powyżej. **Punkt 4 obowiązkowo.**
3. Skonfiguruj GA4 → Google Ads → Meta w tej kolejności.
4. Dopiero potem `event_id` i natywny tag konwersji.
5. Kampanie uruchamiasz na końcu, nie wcześniej.
