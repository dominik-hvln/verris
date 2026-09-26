# PB-24 — wniosek o wpis do Wykazu KSC (projekt do zatwierdzenia)

> **Status: PROJEKT · 2026-09-26 · NIC NIE ZOSTAŁO ZŁOŻONE.** Wniosek składa i podpisuje kierownik podmiotu
> (właściciel) albo osoba z pełnomocnictwem — wyłącznie elektronicznie na **wykaz-ksc.gov.pl**, po zalogowaniu
> Profilem Zaufanym, mObywatelem, e-Dowodem, bankowością elektroniczną albo certyfikatem. Asystent niczego nie
> składa i nie loguje się w imieniu właściciela. **Nie stanowi opinii prawnej.**
>
> Źródła (stan na 26.09.2026): komunikat Ministerstwa Cyfryzacji o samorejestracji w Wykazie KSC (gov.pl/web/cyfryzacja),
> strona „Wykaz KSC” systemu S46 (gov.pl/web/system-s46/wykaz-ksc), FAQ KSC CSIRT NASK (cyber.gov.pl/assets/pdf/faq-ksc.pdf, pyt. 2.10, 2.19, rozdz. 13).

## 1. Termin

| | |
|---|---|
| Przesłanka | pierwsza strefa DNS klienta na `ns1/ns2.verris.pl` **albo** pierwsza domena sprzedana klientowi (reseller Openprovider) — co nastąpi wcześniej |
| Podstawa | art. 5 ust. 1 pkt 4 ustawy o KSC — dostawca usług DNS i podmiot świadczący usługi rejestracji nazw domen = podmiot kluczowy niezależnie od wielkości; w definicji NIS2 (art. 6 pkt 22) mieści się też reseller działający w imieniu rejestratora |
| Termin wniosku | **6 miesięcy od dnia spełnienia przesłanki** (art. 7c ust. 1) |
| Data przesłanki | **_do wpisania w dniu uruchomienia_** → termin: **_data + 6 mies._**; rekomendacja: złożyć w ciągu 30 dni, nie czekać do końca |
| 3.10.2026 | dotyczy podmiotów spełniających przesłanki w dniu wejścia w życie nowelizacji (10.04.2026) — Verris wtedy nie świadczył DNS/domen klientom, więc ten termin nas nie wiąże (decyzja z 23.09.2026, ryzyko przyjęte świadomie) |

## 2. Dane do formularza (wg FAQ KSC pyt. 2.10)

| Pole | Wartość | Stan |
|---|---|---|
| Nazwa (firma) | HVLN Dominik Kowalski | ✔ |
| NIP / REGON | 9292069367 / 521024260 | ✔ |
| Siedziba i adres do korespondencji | Zacisze 2A, 65-775 Zielona Góra | ✔ (potwierdzić adres korespondencyjny) |
| Adres do doręczeń elektronicznych (e-Doręczenia) | _brak w dokumentach_ | **właściciel** — założyć/odczytać w e-Doręczeniach |
| Adres e-mail | `security@verris.pl` | **skrzynka do założenia** (PB-03) |
| Numer w rejestrze działalności regulowanej | prawdopodobnie „nie dotyczy” | **do potwierdzenia** |
| Sektor / podsektor / rodzaj | Infrastruktura cyfrowa: **dostawca usług DNS**, **podmiot świadczący usługi rejestracji nazw domen**; rozważyć dodatkowo „dostawca usług przetwarzania w chmurze” (VPS, hosting) | **do potwierdzenia** — zaznaczyć wszystkie faktycznie świadczone |
| Zakres publicznych adresów IP używanych w sposób ciągły | adresy węzłów i serwera paneli z Hetznera | **po zakupie węzła** — wpisać z konsoli Hetzner, nie z dokumentacji |
| Zakres nazw domen używanych w sposób ciągły | `verris.pl` z subdomenami (panel, api, admin, staff, status, www, mail/webmail/poczta, ns1, ns2, node-pl-NN, grafana, glitchtip) | ✔ — sprawdzić, czy są inne domeny firmowe |
| Osoba do kontaktu (mikro/mały — jedna osoba) | Dominik Kowalski, telefon służbowy, e-mail służbowy | **właściciel** potwierdza telefon 24/7 (ten sam co w `INCIDENT_RESPONSE.md`) |
| Administrator konta w S46 | Dominik Kowalski (PESEL albo identyfikator środka identyfikacji) | **wpisuje właściciel w formularzu** — PESEL nie trafia do repozytorium |

## 3. Po wpisie

1. Dostęp do S46 Cyber Hub — skonfigurować konto administratora, sprawdzić ścieżkę zgłoszenia incydentu (24 h / 72 h / miesiąc — `docs/ops/INCIDENT_RESPONSE.md`).
2. Dopisać numer/datę wpisu do `nis2-ksc-assessment.md` §5 i do RCPD (sekcja D).
3. Każdą zmianę danych z tabeli (nowy zakres IP po kolejnym węźle, zmiana osoby, adresu) aktualizować we wniosku o zmianę wpisu — FAQ (pyt. 2.19) przewiduje korektę danych; termin sprawdzić w ustawie przy pierwszej zmianie.
4. Okres dostosowawczy do 3.04.2027 (środki z art. 21 NIS2 — `nis2-ksc-assessment.md` §3), pierwszy audyt do 3.04.2028.

## 4. Osobny wątek do sprawdzenia (nie blokuje wniosku)

FAQ KSC rozdz. 13 i art. 16b — obowiązki podmiotów rejestrujących domeny: weryfikacja danych abonentów, udostępnianie danych rejestracyjnych uprawnionym podmiotom. Sprawdzić, które z nich realizuje Openprovider jako rejestrator, a które spadają na Verris jako resellera (formularz zamówienia domeny w panelu).

## Do decyzji właściciela

1. Rodzaje działalności: tylko DNS + domeny, czy też usługi chmurowe?
2. Kiedy złożyć: w ciągu 30 dni od przesłanki (rekomendacja) czy bliżej terminu?
3. Adres do e-Doręczeń i numer telefonu 24/7.
