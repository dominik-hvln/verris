# FAK-01 — panel nie wystawia faktury VAT obok programu księgowego

**Status:** DZIAŁA (D2, 2026-09-22) · **Było:** BLOKER STARTU
**Decyzja:** `docs/architektura/ADR-2026-09-22-faktury-w-programie-ksiegowym.md`

## Problem

Właściciel wystawia faktury VAT ręcznie w programie księgowym (do czasu wyboru
biura i integracji po API). Panel tymczasem wystawiał własną fakturę VFV przy
każdym obciążeniu portfela (Z-01), zbiorczej, ręcznej, Stripe i korekcie (M-06).
Jedna płatność = dwie faktury w dwóch seriach. Wyłączony KSeF chronił przed
wysłaniem drugiej do MF, nie przed jej wystawieniem i doręczeniem klientowi.

## Rozwiązanie (wariant C z ADR)

| Element | Gdzie |
|---|---|
| Przełącznik `faktury.tryb` = `panel` \| `zewnetrzny`, domyślnie `zewnetrzny`; wszystko poza dokładnym `panel` → zewnętrzny | `billing/tryb-fakturowania.ts`, `platform-settings.keys.ts` |
| Jedno wejście numeracji dla 5 miejsc; odczyt trybu w tej samej transakcji (bez cache) | `nadajNumerDokumentu` w `billing/faktura-za-portfel.ts` |
| Tryb zewnętrzny: seria **VDR** (korekty **VDK**), `rodzajPrawny = DOKUMENT_ROZLICZENIOWY` | j.w. |
| Korekta idzie za rodzajem dokumentu pierwotnego, nie za bieżącym trybem | `korekty.service.ts` |
| Baza: `rodzajPrawny` + 3 CHECK (dwa rodzaje; seria ⇔ rodzaj; numer zewnętrzny tylko przy dokumencie rozliczeniowym) | migracja `20260922120000_faktury_tryb_zewnetrzny` |
| KSeF: dokument rozliczeniowy nigdy nie kwalifikuje się; `ksef.enabled` efektywnie 0 w trybie zewnętrznym; włączenie odrzucane | `ksef.service.ts`, `platform-settings.service.ts` |
| PDF/mail: „Dokument rozliczeniowy” + adnotacja „nie jest fakturą VAT” | `invoice-pdf.service.ts`, `mail/templates/invoice-notifications.ts` |
| Panel klienta: etykieta + numer faktury zewnętrznej / „w przygotowaniu” | `client-panel/.../invoice-list.tsx`, `contracts/invoice.dto.ts` |
| Operator: kolejka `/invoices/czeka-na-fakture`, dopisanie numeru raz (warunek w WHERE, unikalność, audyt) | `faktury-zewnetrzne.service.ts`, `admin-panel/.../czeka-na-fakture` |
| Niezmiennik po migracji + asercja czerwieniąca się; M-06 akceptuje VDK | `ops/sql/po-migracji-niezmienniki.sql`, `ops/scripts/asercje-czerwienia-sie.sh` |

„Czeka na fakturę” nie jest statusem w `InvoiceStatus` — status mówi o pieniądzach.
Stan wynika z danych: rodzaj rozliczeniowy + brak `externalInvoiceNumber`.

## Obsługa na co dzień

1. Klient płaci → w panelu powstaje dokument `VDR/RRRR/MM/nnnn`.
2. Wystawiasz fakturę VAT w programie księgowym (do 15. dnia następnego miesiąca).
3. Admin → Faktury → **Czeka na fakturę VAT** → wpisujesz numer faktury → klient widzi go przy dokumencie.

Powrót do wystawiania z panelu (np. po integracji API): `platform_settings.faktury.tryb = panel`.
Dopiero wtedy da się włączyć KSeF.

## Weryfikacja (D2)

- lokalnie: lint 0 błędów, typecheck 8/8, 878 testów jednostkowych (w tym `tryb-fakturowania.spec.ts`);
- CI #182 (`a006c8e`): migracja na świeżej bazie bez dryfu, niezmienniki FAK-01,
  2 nowe przypadki w `asercje-czerwienia-sie.sh`, 5 nowych testów integracyjnych
  w `faktura-portfel.int-spec.ts`.

## Otwarte

- Pytanie do księgowej (z ADR): faktura zaliczkowa przy doładowaniu portfela (M-34).
- Integracja z programem księgowym po API — po wyborze biura; szew: tryb `zewnetrzny` + `externalInvoiceNumber`.
