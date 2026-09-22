# ADR 2026-09-22 — węzeł produkcyjny #1: Hetzner AX102

**Status:** przyjęta (PB-14) · **Decyzja właściciela:** 2026-09-22

## Decyzja

Węzeł #1 stoi u Hetznera, serwer dedykowany **AX102** — **259 € netto/mies.** (cena z konfiguratora
podana przez właściciela 2026-09-22; setup wg cennika z lipca 129 €).

## Dlaczego

- PB-01 liczył rentowność właśnie na AX102: próg ok. 44,20 zł/konto przy cenie 45 zł.
  OVH Advance-2 w WAW1 wychodzi 67,76 zł/konto (dysk 960 GB ogranicza węzeł do ok. 30 kont,
  opcja 1,92 TB podrożała w lipcu o ok. 89%).
- Premia za lokalizację w Polsce (ok. 23 zł/konto) nie jest dziś do udźwignięcia przy 45 zł.
- Control-plane już stoi u Hetznera — jeden dostawca, jeden panel, jedna umowa powierzenia.

## Konsekwencje

- **Dane klientów przetwarzane w Niemczech/Finlandii (UE).** Polityka prywatności i DPA muszą
  to wprost opisać przed startem sprzedaży — zadanie dokumentowe (PB-03), na końcu planu.
- DPA z Hetznerem (P-15) potrzebne przed pierwszym klientem — już w planie, sprint 16.
- Marża przy AX102 jest cienka i zależy od Z-12 (księgowanie RAM zamiast rezerwacji pełnych
  8 GB). Pierwsze konta produkcyjne mają dać pomiar realnego zużycia (PB-02).

## Opcje na później (nie teraz)

- Inne serwerownie lub własny sprzęt, w tym **Beyond (Poznań)** — argument „polski hosting".
  Wraca do rozważenia, gdy liczba kont uzasadni premię za lokalizację.
- **EX63** (149 € w lipcu) — tańszy wariant Hetznera, rozważany w analizie infrastruktury;
  wybrany AX102 zgodnie z modelem PB-01.
- **EX130-R** (obecny serwer z Pleskiem, 134 €, stara cena) — po migracji 15 stron
  przeznaczony na węzeł #2, nie do anulowania.
