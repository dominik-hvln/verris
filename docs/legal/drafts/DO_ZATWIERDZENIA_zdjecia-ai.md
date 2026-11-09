# Zdjęcia generowane przez AI w Verris Kreatorze – zmiany w dokumentach (projekt do zatwierdzenia)

> **Status: PROJEKT · 2026-11-09 (paczka 124). Nic nie opublikowano – ten plik nie zmienia `privacy.md`,
> `subprocessors.md`, `dpa.md` ani `rcpd.md`.** Generowanie zdjęć jest w kodzie, ale **domyślnie wyłączone**
> (Admin → Wiedza i AI → Kreator stron → „Generowanie zdjęć AI”, ustawienie `kreator.konfiguracja.obrazyAi.wlaczone`).
> Włączyć dopiero po: (1) akceptacji poniższych zmian przez właściciela, (2) zawarciu umowy powierzenia (DPA)
> z dostawcą obrazów, (3) publikacji Polityki prywatności i listy podprocesorów z nowym wierszem – z zawiadomieniem
> klientów co najmniej 30 dni wcześniej (DPA §7, `README.md` → Utrzymanie).

## 1. Co robi funkcja (stan kodu)

- Edytor kreatora → wybór zdjęcia → zakładka **„Wygeneruj”**: klient opisuje zdjęcie (do 400 znaków, po polsku),
  wybiera proporcje i dostaje 1–4 warianty (próba 1, hosting 2, Kreator Pro 4; limit miesięczny 3 / 20 / 100).
  Kod: `apps/api/src/kreator/generowanie/`, panel: `apps/client-panel/src/app/dashboard/kreator/edytor/zdjecia/wybor-zdjecia.tsx`.
- **Przepływ danych:**
  1. Opis klienta + kontekst strony (branża, nazwa stylu, nazwy kolorów palety, proporcje – **bez nazwy firmy,
     adresu, telefonu, e-maila**) → **Anthropic** (podprocesor już na liście) – model tłumaczy opis na angielski
     prompt fotograficzny i odrzuca opisy sprzeczne z zasadami (osoby publiczne, marki, treści dla dorosłych,
     przemoc, podróbki). Instrukcja dla modelu każe pominąć w prompcie imiona, nazwiska, adresy, telefony i e-maile.
  2. **Do dostawcy obrazów trafia wyłącznie angielski prompt** (+ stały dopisek „bez tekstu, logo, marek,
     rozpoznawalnych osób”) i wymiary obrazu. Bez identyfikatora konta, adresu IP klienta, nazwy firmy, treści strony.
  3. Gotowy obraz serwer Verris pobiera od razu (adres u dostawcy jest tymczasowy), przetwarza jak wgrane zdjęcie
     i zapisuje w bibliotece konta (magazyn Verris u Hetznera). Na stronę klienta trafia kopia pliku – strona nie
     łączy się z dostawcą.
- **Panel ostrzega:** „Nie wpisuj danych osobowych w opisie zdjęcia (imion, nazwisk, adresów, telefonów).”
- **Dziennik kosztów AI** (`AiInteractionLog`, funkcja `kreator-obraz`): liczba obrazów, koszt, skrót SHA-256 promptu,
  identyfikator konta – **bez treści opisu ani promptu**. Retencja jak dotąd (dziennik AI).
- Dostawca domyślny: **Black Forest Labs (FLUX)**, klucz `BFL_API_KEY`. Alternatywa w adminie: **OpenAI Images**
  (klucz `AI_API_KEY` – OpenAI Ireland Ltd jest już na liście podprocesorów).

## 2. Lista podprocesorów – nowy wiersz (`subprocessors.md`, `privacy.md` pkt 5.1, `dpa.md` Załącznik 2)

| Podmiot | Siedziba / lokalizacja danych | Cel przetwarzania | Zakres danych | Transfer poza EOG |
| --- | --- | --- | --- | --- |
| **Black Forest Labs** – **DO SPRAWDZENIA** w umowie/DPA: dokładna nazwa i adres podmiotu umownego (zespół i siedziba operacyjna we Freiburgu im Breisgau, Niemcy; możliwa spółka matka w USA) | Niemcy; region API do wyboru przy wdrożeniu (`api.eu.bfl.ai` – UE, `api.bfl.ai` – globalny) | generowanie zdjęć na strony w Verris Kreatorze | wyłącznie opis obrazu po angielsku przygotowany przez Verris (bez danych konta i danych osobowych); wygenerowany obraz | **do ustalenia** z DPA dostawcy (przy regionie UE i podmiocie z UE – nie; przy podmiocie z USA – SCC) |

Wiersz Anthropic (bez zmiany podmiotu) – dopisać cel: „Verris Kreator: generowanie i zmiany treści stron,
przygotowanie opisu zdjęcia do generowania”. Jeśli admin wybierze OpenAI Images – w wierszu OpenAI dopisać cel
„generowanie zdjęć w Verris Kreatorze (opis obrazu bez danych osobowych)”.

**Status umów (wewnętrzne – nie publikować):** Black Forest Labs – DPA do zawarcia przed wpisaniem `BFL_API_KEY`
i przed włączeniem generowania; sprawdzić: retencja promptów i obrazów u dostawcy, brak trenowania na danych
klienta, region przetwarzania, podwykonawcy dostawcy (chmura GPU).

## 3. Polityka prywatności – nowy akapit (propozycja: przy punkcie o Verris Kreatorze / asystencie AI)

> **Zdjęcia generowane przez AI w Verris Kreatorze.** Jeśli w kreatorze stron poprosisz o wygenerowanie zdjęcia,
> Twój opis zdjęcia przekazujemy modelowi Anthropic (pkt 5.1), który przygotowuje z niego opis po angielsku –
> bez danych Twojej firmy. Ten opis (i tylko on) trafia do dostawcy generowania obrazów [Black Forest Labs] (pkt 5.1),
> który tworzy zdjęcie. Gotowe zdjęcie zapisujemy w bibliotece Twojego konta. Nie wpisuj w opisie zdjęcia danych
> osobowych – imion, nazwisk, adresów ani telefonów; nasze zasady każą je z opisu pominąć, ale najlepiej ich nie podawać.
> W rejestrze kosztów AI zapisujemy liczbę zdjęć i koszt, bez treści opisu. Podstawa: art. 6 ust. 1 lit. b RODO
> (wykonanie umowy – funkcja kreatora, z której korzystasz).

## 4. Oznaczenie treści syntetycznych (AI Act, art. 50) – decyzja w kodzie

- **Art. 50 ust. 2** (obowiązek dostawcy systemu AI generującego obrazy: oznaczenie w formacie odczytywalnym
  maszynowo): Verris udostępnia klientom funkcję generowania (system AI zbudowany na modelu dostawcy), więc
  ostrożnie przyjmujemy ten obowiązek po swojej stronie. **Wykonanie:** każdy plik zdjęcia AI (oryginał w magazynie
  i wszystkie warianty WebP/JPEG kopiowane na hosting klienta) ma metadane XMP z polem IPTC
  `Iptc4xmpExt:DigitalSourceType = http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`
  i opisem „Image generated by AI (Verris Kreator)” (`apps/api/src/kreator/zasoby-obraz.ts`, `XMP_AI`; sharp
  `withXmp` – sprawdzone testem). Metadane od dostawcy (np. C2PA) nie przechodzą – pliki są przetwarzane od nowa.
- **Art. 50 ust. 4** (obowiązek podmiotu stosującego – klienta – ujawnienia deepfake’ów): zdjęcia ilustracyjne na
  stronie firmowej nie są deepfake’ami, a zasady promptu zakazują prawdziwych osób i podróbek zdarzeń. Dlatego
  **bez widocznego znaku na stronie** i **bez dopisku w alt** (alt opisuje treść dla czytników ekranu).
  Renderer nie dodaje atrybutu w HTML – oznaczenie jest w pliku.
- Panel informuje klienta przy generowaniu: „Zdjęcie wygenerowane przez AI. W pliku zapisujemy informację, że
  powstało dzięki AI (metadane) – na stronie nie widać żadnego znaku.”
- **DO SPRAWDZENIA z prawnikiem:** data stosowania art. 50 wobec tej funkcji (harmonogram AI Act i ewentualne
  przesunięcia), czy wystarczy XMP (standard techniczny / kodeks praktyk Komisji może wymagać też znaku wodnego
  albo C2PA), oraz czy Regulamin (§13a z `DO_ZATWIERDZENIA_kreator-pro.md`, ust. 6) ma wprost wspomnieć
  zdjęcia AI („Klient odpowiada za publikowane treści, także zdjęcia wygenerowane przez AI”).

## 5. Do decyzji właściciela

1. Dostawca obrazów: BFL (domyślny w kodzie) czy OpenAI Images (już podprocesor – mniej formalności, inna jakość
   i cena). Przy BFL – region `api.eu.bfl.ai` (w kodzie stała `API_BFL` w `generowanie/bfl.ts`, dziś `api.bfl.ai`).
2. Akceptacja wiersza podprocesora (pkt 2) i akapitu Polityki (pkt 3) – do najbliższej wersji dokumentów.
3. Cena za obraz w adminie (domyślnie 0,04 USD dla FLUX1.1 [pro]) – ustawić wg faktycznego cennika z konta dostawcy.
4. RCPD: dopisać do czynności „Verris Kreator” kategorię odbiorcy (dostawca obrazów) – `docs/legal/rcpd.md`.
