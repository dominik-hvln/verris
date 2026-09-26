# P-11 — rytm przeglądów RCPD (projekt do zatwierdzenia)

> **Status: PROJEKT · 2026-09-26 · nic nie jest opublikowane.** Po akceptacji właściciela treść z sekcji 2–4
> przechodzi do `docs/legal/rcpd.md` (sekcja D), a wiersz P-11 w macierzy dostaje status DZIAŁA.
> RCPD jest dokumentem wewnętrznym (art. 30 ust. 4 RODO — udostępniany organowi na żądanie), nie trafia do panelu.

## 1. Stan na dziś

- `rcpd.md` wersja 1.1 (25.09.2026): sekcje A (administrator, A1–A13), B (procesor, art. 30 ust. 2), C (art. 32), D (przeglądy).
- Forma elektroniczna spełnia art. 30 ust. 3 RODO. Brakuje tylko dyscypliny: stałych terminów, listy zdarzeń wymuszających przegląd i dziennika przeglądów.
- **Niespójność do poprawienia:** ostatni punkt sekcji D mówi „zgłoszenie do wykazu: termin ~3.10.2026”, a decyzja z 23.09.2026 (PB-24) to wpis w ciągu 6 miesięcy od pierwszej domeny/strefy DNS klienta. Propozycja nowego brzmienia w pkt 3.

## 2. Rytm (propozycja)

| Przegląd | Kiedy | Kto | Wynik |
|---|---|---|---|
| Okresowy | co 6 miesięcy: **26 marca** i **26 września** (pierwszy: 26.03.2027) | właściciel | wpis w dzienniku (pkt 4), nowa wersja RCPD tylko przy zmianie treści |
| Zdarzeniowy | przed wdrożeniem zmiany z listy w pkt 2.1 | autor zmiany + właściciel | nowa wersja RCPD przed wdrożeniem na produkcji |
| Po naruszeniu | w ciągu 30 dni od zamknięcia incydentu z danymi osobowymi (`docs/ops/INCIDENT_RESPONSE.md`) | właściciel | wpis w dzienniku + ewentualne zmiany sekcji C |

Przypomnienie: wydarzenie w kalendarzu właściciela + powiadomienie w panelu obsługi (dwa kanały, spójnie z PB-11).

### 2.1 Zdarzenia wymuszające przegląd przed wdrożeniem

1. Nowy lub zmieniony subprocesor (także zmiana regionu przetwarzania) — razem z DPA §7 (30 dni powiadomienia klientów).
2. Nowa kategoria danych albo nowy cel (np. nowa usługa: VPS, sprzedaż domen, e-mail marketing).
3. Zmiana okresu retencji w kodzie (`RetentionScheduler`) albo w polityce prywatności.
4. Włączenie narzędzia z warunkiem aktywacji w RCPD (A12 GTM/Pixel, A13 asystent AI).
5. Nowy transfer poza EOG albo zmiana podstawy transferu (SCC, DPF).
6. Zmiana środków z sekcji C (np. nowy sposób szyfrowania kopii, nowa lokalizacja kopii off-site).
7. Pojawienie się personelu z dostępem do danych (dziś: wyłącznie właściciel).

### 2.2 Lista kontrolna przeglądu okresowego

- [ ] Każda czynność A/B ma aktualny cel, podstawę, kategorie, odbiorców i retencję — porównane z polityką prywatności i DPA Zał. 2.
- [ ] Lista subprocesorów = `subprocessors.md` = polityka pkt 5.1 = DPA Zał. 2 (te same nazwy prawne i adresy).
- [ ] Retencje w RCPD = wartości w `RetentionScheduler` (test `retention.scheduler.spec.ts` zielony).
- [ ] Warunki aktywacji (A12, A13) — nadal spełnione albo nadal wyłączone.
- [ ] Sekcja C zgodna z faktycznym stanem (2FA personelu, VPN, szyfrowanie kopii, testy odtwarzania z `RESTORE_TEST.md`).
- [ ] Decyzja o IOD (art. 37) — przesłanki nadal nie występują.
- [ ] Status KSC/NIS2 — zgodny z PB-24.

## 3. Nowe brzmienie sekcji D w `rcpd.md` (propozycja)

```
## D. Przeglądy i decyzje

- Przegląd okresowy co 6 miesięcy (26 marca, 26 września) oraz przed każdą zmianą z listy
  zdarzeń (subprocesor, nowa kategoria/cel, retencja, transfer, środki art. 32, personel).
  Dziennik przeglądów: sekcja E.
- A12 aktywna dopiero po włączeniu GTM/Pixela … (bez zmian)
- A13 aktywna dopiero po wpisaniu kluczy … (bez zmian)
- IOD: niewyznaczony — brak przesłanek z art. 37 (sprawdzane przy każdym przeglądzie);
  punkt kontaktowy: rodo@verris.pl.
- NIS2/KSC: podmiot kluczowy od uruchomienia DNS/sprzedaży domen dla klientów (art. 5 ust. 1
  pkt 4 ustawy o KSC); wniosek o wpis do wykazu w ciągu 6 miesięcy od tej daty
  (art. 7c ust. 1) — PB-24, `nis2-ksc-assessment.md`.
```

## 4. Dziennik przeglądów — sekcja E (propozycja pierwszego wpisu)

| Data | Rodzaj | Wersja RCPD | Zakres | Wynik | Zatwierdził |
|---|---|---|---|---|---|
| 2026-09-26 | wdrożenie rytmu | 1.1 → 1.2 | sekcja D (rytm, KSC), nowa sekcja E | treść A–C bez zmian | _(podpis właściciela)_ |

## Do decyzji właściciela

1. Terminy 26.03 / 26.09 — czy inne daty (np. razem z przeglądem dokumentów prawnych)?
2. Czy przegląd okresowy ma też iść do panelu obsługi jako zadanie (powiadomienie), czy wystarczy kalendarz?
