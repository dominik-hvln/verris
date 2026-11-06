# Asystent AI na verris.pl — zmiany w dokumentach (projekt do zatwierdzenia)

> **Status: WBUDOWANE w szkic 1.1.0 (paczka 109, 2026-11-03): `privacy.md` §2.8, wiersze w §4 i §5.1 (Anthropic), `subprocessors.md`, `rcpd.md` A14. Asystent na verris.pl włączać dopiero po publikacji 1.1.0 — patrz `ZMIANY_1.1.0-1.2.0.md`.** Historia: PROJEKT · 2026-11-01. Asystent jest w kodzie, ale domyślnie WYŁĄCZONY
> (ustawienie `ai.asystentWww`), a więc niewidoczny na stronie. Włącza się przełącznikiem w Admin → AI → Asystent www;
> pojawia się na verris.pl do ok. minuty po włączeniu (6.11.2026: bez osobnej flagi przy wdrożeniu www).
> Włączenie dopiero po: (1) akceptacji poniższych zmian przez właściciela, (2) publikacji Polityki prywatności
> z nowym punktem, (3) wpisie A14 w RCPD. Ten plik nie zmienia `privacy.md`, `subprocessors.md` ani `rcpd.md` —
> po akceptacji treści trafiają tam w najbliższej wersji.

## 1. Co robi asystent (stan kodu)

- Okno czatu na verris.pl dla osób **bez konta** (przed zakupem). Odpowiada wyłącznie na podstawie: cennika z bazy,
  specyfikacji pakietu, listy „faktów o działaniu” i publicznych artykułów bazy wiedzy (CLIENT/ALL).
  Kod: `apps/api/src/ai/asystent-www/`, widget `apps/www/src/app/(frontend)/components/AsystentWidget.tsx`.
- Model: Anthropic (Claude Sonnet do odpowiedzi, Claude Haiku jako klasyfikator pytań) przez API — ten sam dostawca,
  który już jest na liście podprocesorów (`drafts/subprocessors.md`, wiersz Anthropic Ireland, Limited).
- **Dane:** treść pytań i odpowiedzi; identyfikator rozmowy (UUID) w `sessionStorage` przeglądarki (nie cookie —
  znika po zamknięciu karty); skrót HMAC adresu IP (do dobowego limitu nadużyć — **samego IP nie zapisujemy**);
  koszt i liczba tokenów w dzienniku AI **bez treści pytań**.
- **Retencja:** rozmowa usuwana 30 dni po ostatniej wiadomości (`AsystentRetencjaScheduler`, codziennie 03:40).
  Dziennik kosztów AI — jak dotąd (12 miesięcy, bez treści).
- **Przekazanie człowiekowi:** gdy odwiedzający w oknie asystenta wyśle „Poproś o telefon”, mail do zespołu
  zawiera przebieg tej rozmowy (żeby nie pytać drugi raz o to samo). Formularz telefonu ma już własną klauzulę.
- **Bez cookies i bez profilowania.** Asystent nie zna tożsamości rozmówcy, nie ma dostępu do kont, usług ani danych
  klientów. Okno informuje: „Rozmawiasz z asystentem AI. Nie podawaj haseł ani danych do płatności.” (AI Act art. 50 —
  informacja o interakcji z AI) i „Odpowiedzi mogą zawierać błędy. Wiążące są regulamin i cennik.”

## 2. Polityka prywatności — nowy punkt (propozycja: 2.8, po „2.7 Asystent AI”)

> ### 2.8 Asystent AI na verris.pl
> Na stronie verris.pl możesz zadać pytanie asystentowi AI. Zapisujemy treść Twoich pytań i odpowiedzi asystenta
> oraz skrót (nie sam adres) IP, którego używamy wyłącznie do ograniczania nadużyć. Identyfikator rozmowy trzymamy
> w pamięci karty przeglądarki (sessionStorage), nie w pliku cookie. Rozmowę usuwamy 30 dni po ostatniej wiadomości.
> Odpowiedzi generuje model Anthropic (Anthropic Ireland, Limited) na podstawie naszego cennika, specyfikacji i
> publicznych poradników; dostawca nie trenuje modeli na tych danych. Jeśli w oknie asystenta poprosisz o telefon,
> przekażemy przebieg rozmowy osobie, która oddzwoni. Nie podawaj w rozmowie haseł, danych do płatności ani danych
> szczególnych kategorii.

Tabela celów (pkt 4) — nowy wiersz:

| Cel | Podstawa | Okres |
|---|---|---|
| Asystent AI na verris.pl (odpowiedzi na pytania o ofertę, ochrona przed nadużyciami) | art. 6 ust. 1 lit. f — odpowiadanie na pytania osób zainteresowanych usługą; lit. b — gdy pytanie dotyczy zawarcia umowy | rozmowa 30 dni od ostatniej wiadomości; dziennik kosztów AI (bez treści) 12 miesięcy |

Tabela odbiorców (pkt 5) — w wierszu Anthropic dopisać do celu: „i asystent AI na verris.pl”.

## 3. Lista podprocesorów (`subprocessors.md`)

W wierszu **Anthropic Ireland, Limited** rozszerzyć kolumny:
- cel: „… szkice odpowiedzi obsługi; **asystent AI na verris.pl (pytania osób bez konta)**”,
- dane: „… pytania i odpowiedzi; **pytania odwiedzających verris.pl (bez IP, bez danych konta)**”.

Do DPA z klientami (Zał. 2) **nie** wchodzi — asystent nie przetwarza danych powierzonych przez klientów.

## 4. RCPD — nowa czynność A14

| Nr | Czynność | Cel | Podstawa | Kategorie osób | Kategorie danych | Odbiorcy | Retencja | Transfer |
|---|---|---|---|---|---|---|---|---|
| A14 | Asystent AI na verris.pl | odpowiedzi na pytania o ofertę przed zakupem; przekazanie rozmowy przy prośbie o telefon | 6(1)(f), 6(1)(b) | odwiedzający verris.pl | treść pytań i odpowiedzi, skrót HMAC IP, identyfikator rozmowy, tokeny i koszt | Anthropic Ireland, Limited; zespół Verris (mail przy prośbie o telefon) | rozmowa 30 dni (AsystentRetencjaScheduler); AiInteractionLog 12 mies. | tak — USA, SCC w DPA dostawcy |

## 5. Do sprawdzenia przed włączeniem (nie sprawdzone w tej sesji)

- Aktualny okres przechowywania wejścia/wyjścia API w umowie Anthropic (Commercial Terms / DPA) — wpisać do pkt 2.8,
  jeśli różni się od „nie trenuje modeli”.
- Czy Polityka prywatności 1.1.0 (z pkt 2.7) jest już opublikowana — 2.8 może wejść razem z nią albo w 1.2.0.
- Test balansu interesów (art. 6(1)(f)) — krótka notatka w RCPD (minimalizacja: brak IP, brak cookies, 30 dni).
- Strona /dokumenty i stopka verris.pl: link do polityki z kotwicą do pkt 2.8 (opcjonalnie w oknie asystenta).
