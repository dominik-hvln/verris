# Verris — analiza luk prawnych i stanu zaopiekowania (2026-07-07)

Analiza obejmuje drafty prawne 0.1/0.2 (`docs/legal/drafts/`), RCPD, tracker DPA, ocenę NIS2 oraz stan faktyczny potwierdzony w kodzie i przez operatora (zakres usług na start: hosting współdzielony DirectAdmin, VPS na Hetzner Cloud, rejestracja/transfer domen przez OpenProvider, e-mail marketing, program resellerski; bez kreatora stron). Dokumenty finalne 1.0.0 przygotowane w ramach tej analizy usuwają luki oznaczone [NAPRAWIONE W 1.0.0]; luki operacyjne wymagają działań poza dokumentami.

---

## 1. Luki krytyczne (naprawione w dokumentach 1.0.0)

### 1.1 Nieaktualna podstawa prawna cookies — art. 173 Prawa telekomunikacyjnego
Draft polityki cookies powołuje art. 173 PT. Prawo telekomunikacyjne zostało uchylone 10 listopada 2024 r. przez Prawo komunikacji elektronicznej; przechowywanie informacji na urządzeniu końcowym reguluje obecnie **art. 399 PKE**, a wymogi zgody — **art. 402 PKE** (zgoda zgodna z RODO). Dodatkowo draft błędnie opierał cookies niezbędne na „uzasadnionym interesie" — prawidłową podstawą jest ustawowe wyłączenie z art. 399 ust. 3 PKE (niezbędność do świadczenia usługi żądanej przez użytkownika). [NAPRAWIONE W 1.0.0]

### 1.2 Odesłanie do zlikwidowanej platformy ODR
Draft regulaminu (§14.4) kieruje konsumentów na platformę ODR Komisji Europejskiej. Platforma została zlikwidowana rozporządzeniem (UE) 2024/3228 — od 20 marca 2025 r. nie przyjmowała nowych skarg, a 20 lipca 2025 r. została wyłączona. Utrzymywanie tego odesłania wprowadza konsumenta w błąd (ryzyko zarzutu nieuczciwej praktyki rynkowej). Zastąpiono informacją o ADR: Inspekcja Handlowa, rzecznicy konsumentów, UOKiK. [NAPRAWIONE W 1.0.0]

### 1.3 Brak jakichkolwiek postanowień DSA (akt o usługach cyfrowych)
Verris jest **dostawcą usługi hostingu** w rozumieniu rozporządzenia (UE) 2022/2065 (DSA), stosowanego od 17 lutego 2024 r. Jako mikro/mały przedsiębiorca Verris jest zwolniony z obowiązków sprawozdawczych (art. 15) i obowiązków platform internetowych (art. 19), ale **wiążą go**:

- art. 11–12 — punkty kontaktowe dla organów i odbiorców usługi,
- art. 14 — informacja w warunkach umownych o zasadach moderacji treści,
- art. 16 — mechanizm zgłaszania nielegalnych treści (notice and action),
- art. 17 — uzasadnienie decyzji o usunięciu treści/zawieszeniu usługi,
- art. 18 — zawiadamianie organów o podejrzeniu poważnych przestępstw.

Drafty w ogóle tego nie adresowały. Regulamin 1.0.0 zawiera rozdział o moderacji i zgłoszeniach (punkt kontaktowy: `abuse@verris.pl`). [NAPRAWIONE W 1.0.0 — patrz też luka operacyjna 3.2]

### 1.4 Regulamin nie obejmował faktycznie oferowanych usług
Draft regulaminu dotyczył wyłącznie hostingu współdzielonego, podczas gdy oferta startowa obejmuje także VPS, domeny, e-mail marketing i program resellerski. Świadczenie usługi bez regulaminu narusza art. 8 ustawy o świadczeniu usług drogą elektroniczną, a wobec konsumentów — obowiązki informacyjne z art. 12 ustawy o prawach konsumenta. Regulamin 1.0.0 zawiera odrębne rozdziały dla każdej usługi, w tym specyficzne dla domen zasady wygaśnięcia/redemption i utraty prawa odstąpienia po zarejestrowaniu domeny (art. 38 ust. 1 pkt 1 upk). [NAPRAWIONE W 1.0.0]

### 1.5 Brak numeru telefonu w obowiązkach informacyjnych
Po nowelizacji Omnibus art. 12 ust. 1 pkt 3 ustawy o prawach konsumenta wymaga podania numeru telefonu w informacjach przedumownych. Drafty go nie zawierały. Dokumenty 1.0.0 podają +48 511 589 465. [NAPRAWIONE W 1.0.0]

### 1.6 Rozbieżności między dokumentami a kodem
- Polityka prywatności: retencja `LoginAttempt` „90 dni" — kod (`retention.scheduler.ts`) usuwa po **180 dniach**. Dokument musi opisywać stan faktyczny.
- Polityka prywatności: wysyłka maili „Postfix (MTA na control-plane)" — produkcja używa **Amazon SES** (region EU). AWS nie figurował na liście podmiotów przetwarzających.
- Lista subprocesorów: brak nazw (Hetzner, AWS, Cloudflare, OpenProvider) — same kategorie. Finalna lista wymienia podmioty z nazwy, siedziby i podstawy transferu.
- DPA §5 pkt 7 zobowiązywał do „niewysyłania danych poza EOG", co stoi w sprzeczności z użyciem Stripe/AWS/Cloudflare (spółki z grup amerykańskich, dane w regionie EU, transfer wspierający możliwy). Klauzulę przeredagowano: transfer wyłącznie na zabezpieczeniach z rozdz. V RODO (SCC/DPF) i tylko wobec podmiotów z listy.
[NAPRAWIONE W 1.0.0]

### 1.7 Blankietowa klauzula zmiany regulaminu i cennika
Draft pozwalał zmienić regulamin i cennik bez wskazania przyczyn — klauzule modyfikacyjne bez katalogu ważnych przyczyn są kwestionowane przez UOKiK jako abuzywne (art. 385¹ KC, wpisy do rejestru klauzul). Regulamin 1.0.0 zawiera zamknięty katalog ważnych przyczyn, 30-dniowe uprzedzenie, prawo wypowiedzenia bez konsekwencji oraz gwarancję niezmienności ceny w opłaconym okresie. [NAPRAWIONE W 1.0.0]

### 1.8 Przepadek opłat przy zawieszeniu za naruszenie
Draft (§12.3) przewidywał zawieszenie „bez prawa do zwrotu opłat za bieżący okres" — wobec konsumentów ryzyko uznania za niedozwoloną karę umowną/przepadek świadczenia. W 1.0.0: zawieszenie do wyjaśnienia, wezwanie do zaniechania, wypowiedzenie natychmiastowe przy rażących naruszeniach; wobec konsumentów zwrot proporcjonalny za niewykorzystany okres z zachowaniem roszczeń odszkodowawczych Verris. [NAPRAWIONE W 1.0.0]

---

## 2. Luki istotne (naprawione lub zaopiekowane w 1.0.0)

### 2.1 Kredyty Verris a VAT (bon jednego przeznaczenia)
Dokumenty konsekwentnie traktują doładowanie Portfela jako **emisję bonu jednego przeznaczenia** (art. 2 pkt 43 ustawy o VAT): usługi wyłącznie własne, opodatkowane w Polsce stawką 23%, więc miejsce i stawka znane w chwili emisji — obowiązek podatkowy powstaje przy doładowaniu, faktura wystawiana na doładowanie. Draft mieszał kwalifikacje („bon" i „zaliczka" jednocześnie). Ujednolicono na SPV. **Rekomendacja:** przed pierwszą fakturą wystąpić o interpretację indywidualną KIS potwierdzającą kwalifikację SPV (koszt 40 zł, ochrona prawnopodatkowa) — szczególnie na styku z kredytami promocyjnymi (rabat, poza VAT) i rekompensatami SLA.

### 2.2 Odstąpienie konsumenckie — doprecyzowanie per usługa
Hosting/VPS/e-mail marketing: zgoda na rozpoczęcie przed upływem terminu + zapłata proporcjonalna (art. 35 upk), utrata prawa dopiero po **pełnym** wykonaniu (art. 38 ust. 1 pkt 1). Domeny: rejestracja następuje niezwłocznie i jest w pełni wykonana z chwilą wpisu do rejestru — konsument traci prawo odstąpienia, o czym musi być poinformowany i musi wyrazić wyraźną zgodę przed zakupem (checkbox w koszyku — wymaganie wdrożeniowe, patrz 3.6). Draft tego nie rozróżniał.

### 2.3 Właściwość sądu w DPA
DPA wskazywało sąd siedziby Verris bez zastrzeżeń. DPA zawierają też osoby fizyczne prowadzące działalność (mogą korzystać z ochrony quasi-konsumenckiej w innych relacjach), ale powierzenie przetwarzania z natury dotyczy działalności gospodarczej — klauzula utrzymana dla DPA, natomiast w regulaminie zastrzeżono właściwość ustawową dla konsumentów i przedsiębiorców na prawach konsumenta.

### 2.4 Rejestry domen jako odrębni administratorzy
Przy rejestracji domeny dane abonenta trafiają do rejestratora (OpenProvider) i rejestru (NASK dla .pl, EURid dla .eu itd.), które przetwarzają je jako **odrębni administratorzy** na własnych podstawach — draft polityki prywatności w ogóle nie opisywał tego przepływu. Uzupełniono w polityce 1.0.0.

---

## 3. Luki operacyjne — poza dokumentami (wymagają Twojego działania)

### 3.1 DPA z podwykonawcami — twardy bloker startu
Tracker (`dpa-subprocessors-tracking.md`) pokazuje 0 zawartych umów powierzenia. Przed pierwszym klientem zaakceptuj/zawrzyj: **Hetzner** (DPA w panelu konta, obejmuje Storage Box), **Stripe** (DPA online), **AWS** (DPA w ramach Service Terms + wybór regionu EU), **Cloudflare** (DPA online), **OpenProvider** (DPA rejestratora). Wszystkie mają standardowe DPA akceptowane elektronicznie — to godzina pracy, ale bez tego lista subprocesorów w polityce jest deklaracją bez pokrycia.

### 3.2 Skrzynka abuse@verris.pl
Regulamin 1.0.0 wskazuje `abuse@verris.pl` jako punkt kontaktowy DSA (zgłoszenia nielegalnych treści) — skrzynka musi istnieć i być monitorowana przed publikacją dokumentów. Analogicznie potwierdź działanie `rodo@verris.pl`.

### 3.3 KSeF 2.0 — dokończyć przed pierwszą fakturą B2B
Kod celuje w FA(2)/KSeF 1.0, nieobowiązujące od lutego 2026. Zadeklarowałeś własną integrację KSeF 2.0/FA(3) — do czasu jej ukończenia i przetestowania na środowisku DEMO MF nie wystawiaj faktur B2B z systemu (moduł FA(2) oznaczyć jako wyłączony, zgodnie z taskiem KSEF-LEGACY-1). Faktury konsumenckie pozostają poza obowiązkowym KSeF.

### 3.4 NIS2 / ustawa o KSC
Nowelizacja KSC obowiązuje od 3 kwietnia 2026 r. Verris (infrastruktura cyfrowa: hosting, DNS, domeny) podlega samoidentyfikacji — dla większości podmiotów termin zgłoszenia do wykazu upływa około **3 października 2026 r.** Rejestracja domen może kwalifikować Verris ostrzej (rejestratorzy — niezależnie od wielkości). Wyznacz osobę kontaktową ds. cyberbezpieczeństwa i złóż zgłoszenie w terminie — to obowiązek administracyjny niezależny od dokumentów klienckich.

### 3.5 Backup off-site i kopie kont klientów (art. 32 RODO)
`MIRROR_EXTERNAL_ENABLED=0` oraz brak zautomatyzowanych kopii kont klientów off-node (S-1/S-2 z oceny 2026-06-10). Regulamin 1.0.0 celowo nie obiecuje self-restore ani gwarantowanych kopii kont klientów — obiecuje kopie infrastrukturalne i narzędzia kopii w DirectAdmin. Gdy wdrożysz S-1, zaktualizuj regulamin (to zmiana na korzyść klienta — nie wymaga trybu zmiany regulaminu).

### 3.6 Wdrożenia w UI wymagane przez dokumenty
- checkbox zgody na natychmiastowe rozpoczęcie świadczenia + pouczenie o skutkach (hosting/VPS/EMM) oraz odrębny checkbox utraty prawa odstąpienia przy domenach — w koszyku, przed płatnością;
- potwierdzenie zawarcia umowy na trwałym nośniku: e-mail transakcyjny po zakupie z załączonym/podlinkowanym regulaminem w wersji z dnia zakupu i informacjami konsumenckimi (`consumer-info.md`);
- formularz odstąpienia dostępny z poziomu panelu i stopki;
- przy promocjach cenowych — prezentacja najniższej ceny z 30 dni przed obniżką (Omnibus, art. 4 ust. 2 ustawy o informowaniu o cenach).

### 3.7 Rejestr czynności przetwarzania i przegląd retencji
RCPD istnieje (dobrze) — utrzymuj go przy każdej zmianie stacku. Formalne wyznaczenie IOD nie jest na tę skalę obowiązkowe (brak przetwarzania szczególnych kategorii na dużą skalę), ale adres `rodo@verris.pl` utrzymuj jako punkt kontaktowy; decyzję rewiduj przy wzroście skali.

### 3.8 Dostępność (EAA)
Ustawa o zapewnianiu spełniania wymagań dostępności (wdrożenie EAA, obowiązuje od 28.06.2025) zwalnia **mikroprzedsiębiorców świadczących usługi** — HVLN obecnie korzysta ze zwolnienia. Przy przekroczeniu progów (10 pracowników / 2 mln EUR) panel i proces zakupowy będą musiały spełniać wymagania dostępności.

### 3.9 Interpretacja KIS dla Kredytów Verris
Jak w 2.1 — rekomendowane wystąpienie o interpretację indywidualną (kwalifikacja SPV, moment obowiązku podatkowego, traktowanie kredytów promocyjnych i rekompensat SLA jako rabatów poza VAT).

---

## 4. Co było dobrze zaopiekowane (bez zmian koncepcyjnych)

Architektura zgód z wersjonowaniem i re-consent, eksport danych (art. 20), usuwanie konta z 14-dniowym grace i anonimizacją, retencja automatyczna, generator DPA w panelu, procedura naruszeń 72 h, rozdzielenie ról administrator/procesor, SLA z kredytami, ograniczenie odpowiedzialności B2B z wyłączeniem konsumentów, przedsiębiorca na prawach konsumenta uwzględniony, reklamacje 14 dni z fikcją uznania. To poziom rzadko spotykany przed startem — dokumenty 1.0.0 zachowują te konstrukcje, korygując wady wskazane wyżej.

---

## 5. Mapa dokumentów finalnych 1.0.0

| Plik | Dokument | Publikacja |
|------|----------|------------|
| `docs/legal/drafts/terms.md` | Regulamin świadczenia usług (ramowy + rozdziały usług: hosting, VPS, domeny, e-mail marketing, reseller + SLA + AUP/DSA + załącznik: wzór odstąpienia) | panel, kind `TERMS` |
| `docs/legal/drafts/privacy.md` | Polityka prywatności | panel, kind `PRIVACY` |
| `docs/legal/drafts/cookies.md` | Polityka cookies (PKE) | panel, kind `COOKIES` |
| `docs/legal/drafts/dpa.md` | Umowa powierzenia (DPA) + TOM + lista subprocesorów | panel, kind `DPA` |
| `docs/legal/drafts/subprocessors.md` | Źródłowa lista podwykonawców | załącznik DPA / strona publiczna |
| `docs/legal/consumer-info.md` | Informacje przedumowne dla konsumenta + pouczenie o odstąpieniu + formularz | checkout + e-mail potwierdzający |

Publikacja: `ops/scripts/prod-legal-publish-live.sh` (wersja 1.0.0, wymusza re-consent).
