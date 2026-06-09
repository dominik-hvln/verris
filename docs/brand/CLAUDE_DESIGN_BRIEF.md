# Brief dla Claude Design — Key Visual Verris

**Ważne:** W panelu jest tylko **tymczasowa ikona z biblioteki UI** (placeholdery deweloperskie). **Nie ma zaprojektowanego logo.** Claude Design ma stworzyć logo **od zera**, wyłącznie pod ten projekt.

Załącz: screenshoty cyberFolks + DirectAdmin + (opcjonalnie) panelu **tylko jako klimat UI dark**, nie jako logo.

**Nie załączaj** `verris-logo-mark.svg` — to nie jest marka.

---

## PROMPT 1 — LOGO (uruchom najpierw, osobna sesja)

Skopiuj blok poniżej. To jest **obowiązkowy** pierwszy krok. Dopiero po wyborze logo uruchom PROMPT 2 (pełne KV).

```
Jesteś seniorem brand identity. Twoje **jedyne zadanie w tej sesji** to zaprojektować **oryginalne logo** marki **Verris** od zera — nie „ulepszyć” istniejącego znaku, bo **żadnego logo marki nie ma**.

---

## KRYTYCZNE — przeczytaj przed projektem

- W załącznikach (jeśli są) może być widoczna **generyczna ikona „layers”** z zestawu ikon UI w panelu logowania. To **placeholder deweloperski**, nie logo, nie brief, nie inspiracja. **Zignoruj go w 100%.** Nie kopiuj jego kształtu, nie „ewoluuj”, nie „odśwież”.
- Jeśli Twój pomysł przypomina stockową ikonę (layers, server rack, cloud upload, globe z strzałką, tarcza z literą V) — **odrzuć go** i zacznij od nowa.
- Logo musi wyglądać jak **zlecenie identyfikacji wizualnej** (custom wordmark + custom symbol), nie jak przypięta ikona z Figma/Lucide/Heroicons.

---

## Kim jest Verris (brief marki)

**Verris** — polski hosting zarządzany + panel klienta SaaS (produkcja LIVE).

| | |
|---|---|
| Domeny | verris.pl · panel.verris.pl |
| Produkt | hosting WWW, DNS, SSL, poczta, backupy, billing (Stripe/portfel), program **EKO** (ekologia, „Las Verris”) |
| Odbiorca | MŚP, freelancerzy, agencje w PL — chcą spokoju, przejrzystości i partnera, nie „taniego serwera” |
| Odczucie | nowoczesny, **spokojny**, wiarygodny, techniczny ale ludzki; premium bez korporacyjnej sztywności |
| UI produktu | głównie **ciemny panel** (#0A0A0A); osobno jasna strona „domena gotowa” dla klientów |

**Nazwa „Verris”** — krótka, międzynarodowa, z dwoma „r”; możesz subtelnie nawiązać do *veritas / reliability / version / vertex* tylko jeśli wynika to z formy znaku (bez nachalnej symboliki w tekście sprzedażowym).

**Metafory do eksploracji (wybierz 1–2, nie wszystkie naraz):**
- stabilność i ciągłość usługi (uptime, opieka)
- warstwa abstrakcyjna: infrastruktura pod witryną klienta (nie dosłowny rysunek serwera)
- wzrost klienta (skalowanie planów) — organicznie, nie „strzałka w górę” z clipartu
- ekologia (EKO) — opcjonalny drugi poziom w znaku lub osobny badge później

**Metafory zabronione jako główny znak:**
- glob, chmura z strzałką, rack serwerów, kabel RJ45, tarcza „security”, litera V w heksagonie, koparka/budowa (DirectAdmin)

---

## Konkurencja wizualna (odróżnienie)

Unikaj wyglądu typowego hostera PL/EU: żółty cyberFolks, niebieski home.pl, pomarańcz OVH, zielony Zenbox itd.  
**Verris** ma być rozpoznawalny **kształtem znaku + proporcjami wordmarku**, nie „kolejnym kolorem akcentu”.

Kolory marki ustalisz **razem z logo** (nie zakładaj z góra sky/emerald — zaproponuj paletę uzasadnioną przez logo).

---

## Proces — wymuszony (nie pomijaj kroków)

### Krok A — Eksploracja (3 kierunki)

Zaproponuj **trzy odrębne kierunki logo** (A / B / C). Każdy musi mieć:
- inną metaforę wizualną
- inną geometrię (nie 3 warianty tego samego symbolu)
- szkic/opis + monochromatyczny render (SVG lub PNG)
- 2 zdania: dlaczego pasuje do Verris

### Krok B — Rekomendacja

Wybierz **jeden** kierunek jako rekomendowany. Uzasadnij odrzucenie pozostałych (czytelność w 16px, dark UI, PL rynek).

### Krok C — Finalizacja

Dopracuj **tylko** wybrany kierunek do wersji produkcyjnej.

---

## Wymagania techniczne logo

**Wordmark**
- Custom typografia lub starannie dobrany font z **modyfikacją** (kerning, charakter „rr”, opcjonalnie ligatura) — nie sama nazwa „Verris” w Inter Bold bez pracy.
- Wariant: sama nazwa; nazwa + znak; znak samodzielny.

**Symbol (mark)**
- Musi działać w **16×16** (favicon) — przetestuj i pokaż crop 16px.
- Czytelny na **#0A0A0A** i na **#FFFFFF**.
- Wersje: pełny kolor, mono czarny, mono biały, jednokolorowy akcent.

**Zasady**
- Bez fotorealizmu, bez złożonych gradientów **w obrębie znaku** (gradient tła UI OK osobno).
- Clear space: min. 0,5× wysokość znaku.
- Export: **SVG z prawdziwymi ścieżkami** (edytowalne w Figma/Illustrator) + PNG @1x @2x dla każdego wariantu.

**Opcjonalnie:** lockup z tagline „Hosting zarządzany” (mniejszy, secondary).

---

## Deliverables — tylko logo (checklist)

- [ ] 3 kierunki eksploracji (A/B/C) z opisem
- [ ] 1 wybrany kierunek — final
- [ ] `verris-logo-mark.svg` + `verris-logo-mark-mono-dark.svg` + `verris-logo-mark-mono-light.svg`
- [ ] `verris-logo-wordmark.svg` + `verris-logo-lockup-horizontal.svg`
- [ ] PNG 512px i 1024px (mark + lockup)
- [ ] Favicon: 16, 32, 48, 180 (apple-touch)
- [ ] 1 strona PDF/MD: grid logo, clear space, min size, **don’t** (w tym: nie używać ikony UI z panelu)

**Na końcu napisz:** „To logo zastępuje wyłącznie placeholder deweloperski; nie jest powiązane z żadną ikoną z biblioteki UI.”

Nie projektuj jeszcze pełnego KV, mockupów dashboardu ani papieru firmowego — **tylko logo** w tej sesji.
```

---

## PROMPT 2 — PEŁNE KV (po wybranym logo)

Gdy masz zaakceptowane logo z PROMPT 1, wklej je jako załącznik + ten prompt:

```
Na podstawie **zaakceptowanego logo Verris** (załącznik — jedyne źródło prawdy dla znaku) zbuduj pełny Key Visual v1.0.

**Zakaz:** tworzenia nowego symbolu logo ani „alternatywnego” znaku. Rozszerz tylko system: kolory, typografia UI, ilustracje, mockupy, materiały firmowe, badge EKO.

Kontekst produktu: polski hosting + panel SaaS (dark UI), program EKO, strona placeholder domeny (czytelność jak cyberFolks, ale nasza marka).

Dostarcz:
- Paletę (12+ tokenów HEX + CSS :root)
- Typografię UI (body/UI font + ewentualna relacja do wordmarku)
- 1 hero SVG (strona domyślna hostingu) — spójny ze znakiem, nie clipart DA
- Mockup: login dark + sidebar + placeholder light (copy PL)
- Papier A4, wizytówka, OG 1200×630, badge EKO
- Brand guidelines PDF 4–8 stron
- Dev handoff: struktura folderów pod `docs/brand/assets/`

Załączniki inspiracyjne layoutu (nie logo): cyberFolks placeholder, DirectAdmin default (anty-wzór).
```

---

## Załączniki

| Załącz | Tak / Nie |
|--------|-----------|
| Screenshot cyberFolks (layout) | Tak |
| Screenshot DirectAdmin (anty-wzór) | Tak |
| Screenshot panelu (klimat dark UI) | Opcjonalnie — **nie jako logo** |
| `verris-logo-mark.svg` z repo | **Nie** |

---

## Po powrocie

Paczka → `docs/brand/assets/`. W Cursor: podłączenie do panelu, placeholder hostingu, aktualizacja `VERRIS_KEY_VISUAL.md`.
