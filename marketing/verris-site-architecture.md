# Verris — architektura informacji (verris.pl)

Nowa strona wielostronicowa (nie one-page). Wzorzec rynkowy PL (dhosting.pl, cyberfolks.pl),
URL-e i nazwy po polsku pod słowa kluczowe. Zasada 3 kliknięć: każda ważna strona ≤3 kliknięcia od home.

## 1. Hierarchia stron (drzewo + URL)

```
/                                     Home
├─ /hosting                           Hosting z autoskalowaniem (pillar)
│  ├─ /hosting/wordpress              Hosting WordPress (SEO)
│  ├─ /hosting/sklep                  Hosting pod sklep / WooCommerce (SEO)
│  └─ /poczta                         Poczta e-mail w hostingu (SEO)
├─ /vps                               VPS (niezarządzany, root)
├─ /domeny                            Rejestracja i transfer domen
├─ /email-marketing                   E-mail marketing (wysyłki)
├─ /reseller                          Program resellerski
├─ /funkcje                           Funkcje (hub)
│  ├─ /funkcje/autoskalowanie         Autoskalowanie (pillar techniczny)
│  ├─ /funkcje/migracja               Migracja — informacyjnie → CTA /przenies-strone
│  ├─ /funkcje/ssl                    Certyfikaty SSL
│  ├─ /funkcje/kopie-zapasowe         Kopie zapasowe i odtwarzanie
│  ├─ /funkcje/analityka-bez-cookies  Prywatna analityka bez cookies
│  ├─ /funkcje/rodo-i-dpa             RODO, DPA, podprocesorzy
│  └─ /funkcje/sla                    SLA 99,5% z rekompensatami
├─ /cennik                            Cennik hostingu (+ odnośniki do VPS/domen)
├─ /przenies-strone                   Landing migracyjny (konwersja — istnieje)
├─ /blog                              Blog (lista, z Payload)
│  └─ /blog/{slug}                    Wpis bloga
├─ /pomoc                             Pomoc / baza wiedzy (hub + FAQ)
├─ /o-nas                             O Verris
├─ /kontakt                           Kontakt (formularz → generate_lead)
└─ (external) status.verris.pl · panel.verris.pl · panel.verris.pl/legal/*
```

**Programmatic SEO (faza 2, nie budujemy teraz):**
`/hosting-dla/{use-case}` (sklepu, agencji, wordpress, bloga) oraz `/vs/{konkurent}`
(tylko weryfikowalne fakty z datą — decyzja Dominika; bez deprecjonowania).

## 2. Nawigacja

**Header (6 pozycji + CTA):** Usługi ▾ (mega: Hosting, Hosting WordPress, VPS, Domeny,
E-mail marketing, Reseller, Poczta) · Funkcje · Cennik · Blog · Pomoc · **[Załóż konto]** + „Zaloguj".

**Breadcrumbs:** odwzorowują URL, wszystkie segmenty klikalne poza bieżącym
(`Home › Funkcje › Autoskalowanie`).

**Footer (4 kolumny):**
- *Usługi:* Hosting, VPS, Domeny, E-mail marketing, Reseller
- *Funkcje:* Autoskalowanie, Migracja, SSL, Kopie, Analityka bez cookies, SLA
- *Firma:* O nas, Blog, Pomoc, Kontakt, Status
- *Prawne:* Regulamin, Polityka prywatności, Cookies, DPA (→ panel.verris.pl/legal)

## 3. Mapa URL (priorytet SEO/konwersja)

| Strona | URL | Rodzic | Nawigacja | Priorytet |
|---|---|---|---|---|
| Home | `/` | — | — | ★★★ |
| Hosting | `/hosting` | / | header (mega) | ★★★ |
| Hosting WordPress | `/hosting/wordpress` | /hosting | mega | ★★ |
| Hosting sklep | `/hosting/sklep` | /hosting | mega | ★★ |
| Poczta | `/poczta` | /hosting | mega/footer | ★ |
| VPS | `/vps` | / | header | ★★★ |
| Domeny | `/domeny` | / | header | ★★★ |
| E-mail marketing | `/email-marketing` | / | mega | ★★ |
| Reseller | `/reseller` | / | mega | ★★ |
| Funkcje (hub) | `/funkcje` | / | header | ★★ |
| Autoskalowanie | `/funkcje/autoskalowanie` | /funkcje | hub | ★★★ |
| Cennik | `/cennik` | / | header | ★★★ |
| Migracja (LP) | `/przenies-strone` | / | header/mega | ★★★ |
| Blog | `/blog` | / | header | ★★ |
| Wpis | `/blog/{slug}` | /blog | — | ★★ |
| Pomoc | `/pomoc` | / | header | ★ |
| O nas | `/o-nas` | / | footer | ★ |
| Kontakt | `/kontakt` | / | footer | ★★ |

## 4. Linkowanie wewnętrzne (hub-and-spoke)

- **Pillar `/hosting`** ↔ spokes `/hosting/wordpress`, `/hosting/sklep`, `/poczta`, `/funkcje/autoskalowanie`, `/cennik`, `/przenies-strone`.
- **Pillar `/funkcje/autoskalowanie`** ↔ `/cennik` (kalkulator), `/hosting`, blog o kosztach.
- **Blog** = klaster wokół migracji i kosztów hostingu; każdy wpis linkuje pillar `/hosting` i powiązane wpisy.
- **Zero sierot:** każda strona ma ≥1 link przychodzący (z nawigacji/mega/footer/breadcrumbs).
- CTA konwersyjne (`Załóż konto` → panel, `Przenieś stronę` → /przenies-strone) na każdej stronie usługowej.

## 5. Compliance w strukturze

Ceny brutto PLN na każdej stronie z ceną; „bez limitu" zawsze z notą fair use; ECO tylko jako
nazwa funkcji (bez green claims); SLA 99,5% (nie 100%); strony prawne linkowane do panelu, nie
duplikowane; baner cookie site-wide (Consent Mode v2 default denied). Każda strona przed publikacją → `marketing:brand-review`.
