# Zgłoszenia do otwartej bety (verris.pl/beta) — zmiany w dokumentach (projekt do zatwierdzenia)

> **Status: WBUDOWANE w szkic 1.1.0 (paczka 109, 2026-11-03): `privacy.md` §2.10 i wiersz w §4, `rcpd.md` A15. Publikacja razem z 1.1.0 — patrz `ZMIANY_1.0.0-1.1.0.md`.** Historia: PROJEKT · 2026-11-02. Formularz i obsługa zgłoszeń są w kodzie
> (`apps/api/src/beta/beta-zgloszenia.*`, panel admina → Testy (beta) → Zgłoszenia). Polityka prywatności
> (opublikowana i szkic 1.1.0 w `drafts/privacy.md`) **nie opisuje** rekrutacji testerów ani formularzy na stronie
> poza marketingiem (§4: „Marketing własny … zgoda”). Zgłoszenie do testów nie jest marketingiem — to prośba
> o zaproszenie — więc potrzebny jest osobny wiersz. Ten plik nie zmienia `privacy.md` ani `rcpd.md`; po akceptacji
> treści trafiają tam w najbliższej wersji, **przed uruchomieniem kampanii rekrutacyjnej**.

## 1. Co robi formularz (stan kodu)

- **Dane:** imię, adres e-mail, co chcesz sprawdzić (WordPress / sklep / strony dla klientów / poczta / inne),
  opcjonalnie adres strony, obecny hosting i uwagi; treść klauzuli zgody i chwila wysłania; adres IP i User-Agent
  (dowód zgłoszenia i ochrona przed nadużyciem); parametry UTM z adresu strony (skąd przyszło zgłoszenie).
- **Przebieg:** mail z linkiem potwierdzenia (double opt-in) → zgłoszenie widzi właściciel → zaproszenie z imiennym
  kodem albo odmowa (opcjonalnie uprzejmy mail). Bez potwierdzenia adresu nie wysyłamy zaproszenia.
- **Ochrona przed nadużyciem:** captcha, limit 5 zgłoszeń na godzinę z jednego IP i na jeden adres, najwyżej jeden mail
  na adres na dobę, ukryte pole na boty.
- **Retencja (automatyczna, codziennie 03:50):** niepotwierdzone — 7 dni; potwierdzone bez zaproszenia i odrzucone —
  90 dni od wysłania; po zaproszeniu dane zgłoszenia zostają razem z zaproszeniem (kod testera), a dalej obowiązują
  okresy z umowy, jeśli tester założy konto.
- **Odbiorcy:** dostawca poczty transakcyjnej (mail potwierdzający i zaproszenie) — już na liście podprocesorów;
  Cloudflare Turnstile (captcha) — już na liście. Brak nowych podmiotów.
- **Reklama:** jeśli odwiedzający zgodził się na cookies marketingowe, wysłanie formularza może być zdarzeniem
  konwersji Meta/Google (§5.2 i §8 Polityki — zaawansowane dopasowanie e-maila w postaci SHA-256). Bez tej zgody
  nic nie trafia do reklamodawców.

## 2. Polityka prywatności — nowy wiersz w §4 (tabela celów)

> | Zgłoszenie do testów Verris przed startem (formularz verris.pl/beta): potwierdzenie adresu, wybór testerów, zaproszenie z kodem albo odpowiedź odmowna | ust. 1 lit. b — działania na Twoje żądanie przed zawarciem umowy | niepotwierdzone zgłoszenie 7 dni; zgłoszenie bez zaproszenia 90 dni od wysłania; po zaproszeniu — jak dane konta, jeśli je założysz |

Oraz w §2 nowy punkt (propozycja: 2.9 albo kolejny wolny numer):

> ### 2.x Zgłoszenie do testów
> Jeśli zgłaszasz się do testów Verris, przetwarzamy dane z formularza (imię, e-mail, co chcesz sprawdzić, opcjonalnie
> adres strony, obecny hosting i uwagi), treść zgody, czas wysłania, adres IP i przeglądarkę oraz informację, z jakiej
> kampanii lub strony przyszło zgłoszenie. Wiadomości wysyłamy tylko w sprawie testów — bez newslettera i ofert.

## 3. Klauzula przy formularzu (verris.pl/beta) — do potwierdzenia

Obecna treść z makiety: „Chcę dostać zaproszenie do testów i wiadomości z nimi związane. Administratorem danych jest
HVLN Dominik Kowalski; szczegóły w polityce prywatności.” — zgodna z wierszem wyżej (lit. b, wiadomości tylko o testach).
Mail z odmową nie zapowiada startu ani ofert, bo ta klauzula ich nie obejmuje (PKE).

## 4. RCPD (`docs/legal/rcpd.md`) — nowa czynność

> A15 · Rekrutacja testerów (otwarta beta) · kategorie: osoby zgłaszające się przez verris.pl/beta · dane jak w pkt 1 ·
> podstawa art. 6 ust. 1 lit. b · odbiorcy: dostawca poczty transakcyjnej, Cloudflare (captcha) · retencja 7/90 dni ·
> zabezpieczenia: captcha, limity, double opt-in, dostęp tylko z uprawnieniem PROMO_MANAGE w panelu admina przez VPN.

## Do decyzji właściciela

1. Akceptacja wiersza §4 i punktu §2 (wejdą do Polityki 1.1.0 — publikacja = ponowna akceptacja przez klientów).
2. Czy okres 90 dni dla zgłoszeń bez zaproszenia jest dobry (pozwala zaprosić z listy rezerwowej do końca bety
   i chwilę po niej).
