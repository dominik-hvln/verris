# PB-03 — pakiet publikacji dokumentów prawnych 1.0.0 (projekt do zatwierdzenia)

> **Status: PROJEKT · 2026-09-26 · nic nie zostało opublikowane ani zmienione w dokumentach.** Poniżej: rozjazdy
> znalezione przy przeglądzie, propozycja jednolitej wersji, brakujący tekst §10 ust. 5 i lista kroków do dnia
> publikacji. Decyzje z 23.09.2026 bez zmian: publikacja bez zewnętrznego przeglądu, raz, tuż przed pierwszym klientem.

## 1. Rozjazdy wersji (do naprawy przed publikacją)

| Plik | Nagłówek | Stopka | Problem |
|---|---|---|---|
| `terms.md` | 1.2.0, „od dnia publikacji” | „1.1.0 — publikacja 10 lipca 2026” | stopka nieaktualna; notki „Zmiany wobec 1.1.0 / 1.0.0” opisują wersje, których żaden klient nie zaakceptował |
| `privacy.md` | 1.0.3, „od dnia publikacji” | „1.0.0 — publikacja 7 lipca 2026” | jw. |
| `cookies.md` | 1.0.0, „obowiązuje od 7 lipca 2026” | „1.0.0 — 7 lipca 2026” | data wejścia w życie w przeszłości, a dokument nie był opublikowany |
| `dpa.md` | 1.0.0, „obowiązuje od 7 lipca 2026” | jw. | jw. |
| `subprocessors.md` | 1.0.0, „stan na 7 lipca 2026” | — | treść aktualna (Streamsoft, OpenAI, Anthropic są), nieaktualna tylko data „stan na” |
| `README.md` | „FINAL 1.0.0 (2026-07-07)” | — | sprzeczne z powyższym |
| `ops/scripts/prod-legal-publish-live.sh` | domyślnie publikuje **wszystko jako 1.2.0** (`LEGAL_LIVE_VERSION`) | — | numer w bazie ≠ numery w nagłówkach |

**Propozycja:** skoro to pierwsza publikacja, wszystkie dokumenty dostają **1.0.0** i datę dnia publikacji:
- nagłówek: `**Wersja 1.0.0 · obowiązuje od [DATA PUBLIKACJI]**`;
- stopka: `**Wersja 1.0.0 — data publikacji i wejścia w życie: [DATA PUBLIKACJI]**`;
- usunąć notki „Zmiany wobec …” (historia robocza zostaje w git);
- publikacja: `LEGAL_LIVE_VERSION=1.0.0 ./ops/scripts/prod-legal-publish-live.sh`;
- README: status „DO PUBLIKACJI”, po publikacji „OPUBLIKOWANE 1.0.0 — [DATA]”.

Zamiana dat to jedna komenda w dniu publikacji (asystent przygotuje, gdy znana będzie data).

## 2. §10 ust. 5 regulaminu — tekst po teście D3 węzła (propozycja)

Obecny tekst jest ogólny („Panel … umożliwia samodzielne tworzenie i pobieranie kopii”). Po D3 (`docs/ops/CHECKLISTA_D3.md`, H-14/H-15) proponowane brzmienie — wartości w nawiasach **wyłącznie z wyników testu**, nie z założeń:

> 5. Verris wykonuje kopie zapasowe kont hostingowych co najmniej raz na [dobę], przechowuje je przez [N dni] w lokalizacji
> oddzielonej od serwera, na którym działa konto, w postaci zaszyfrowanej. Klient może w Panelu samodzielnie: utworzyć kopię
> konta, pobrać ją oraz przywrócić konto lub jego część z kopii wykonanej przez Verris; przed przywróceniem Panel tworzy
> kopię zabezpieczającą bieżącego stanu. Kopie wykonywane przez Verris nie zwalniają Klienta z obowiązku utrzymywania
> własnych kopii danych o krytycznym znaczeniu.

Zmiana na korzyść klienta — jeśli regulamin byłby już opublikowany, wchodzi bez trybu 30 dni (§24 ust. 4). Ta sama liczba dni musi się zgadzać z: `consumer-info.md`, stroną /specyfikacja (PB-07) i DPA Zał. 1 (TOM).

## 3. ClouDNS — wpis po zakupie (propozycja)

Źródło: polityka prywatności ClouDNS (cloudns.net/privacy-policy, stan 26.09.2026): **Cloud DNS Ltd., Sofia, Bułgaria (UE)**;
transfery poza EOG u ich podwykonawców na SCC / decyzjach o adekwatności. Polityka nie wskazuje gotowego DPA —
**przed zakupem zapytać support o DPA** (art. 28 RODO) i adres rejestrowy do listy.

Wiersz do `subprocessors.md`, polityki pkt 5.1 i DPA Zał. 2 (po uzupełnieniu adresu):

| Cloud DNS Ltd. | [adres], Sofia, Bułgaria | serwery nazw (DNS) stref klientów — zapasowe/anycast | nazwy domen, rekordy DNS stref (bez treści stron i poczty) | EOG; ewentualne transfery u podwykonawców — SCC |

Jeśli w dniu zakupu są już klienci: powiadomienie e-mail 30 dni przed (DPA §7).

## 4. Lista kroków do dnia publikacji

- [ ] Skrzynki: `kontakt@`, `rodo@`, `abuse@`, `security@verris.pl` — założone i sprawdzone wiadomością testową.
- [ ] Akceptacje DPA u dostawców: Hetzner, Openprovider, Cloudflare, Firmino (Streamsoft) — zapisać datę w `subprocessors.md` (tracker).
- [ ] D3 węzła → wartości do §10 ust. 5 (pkt 2).
- [ ] ClouDNS: DPA + wiersz listy (pkt 3), jeśli kupiony przed publikacją.
- [ ] Ujednolicenie wersji i dat (pkt 1).
- [ ] Na produkcji przed publikacją: `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa` pokazują „Dokument w przygotowaniu” (czyli nic nie jest jeszcze opublikowane).
- [ ] Publikacja skryptem z `LEGAL_LIVE_VERSION=1.0.0`, potem smoke re-consent (LEG-4) i żadnej strony „Dokument w przygotowaniu”.

## Do decyzji właściciela

1. Wszystko jako 1.0.0 (rekomendacja) czy zostawić obecną numerację (1.2.0 / 1.0.3 / 1.0.0)?
2. Czy ClouDNS kupujemy przed publikacją (wtedy od razu w 1.0.0), czy później z powiadomieniem 30 dni?
