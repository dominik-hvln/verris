# NIS2 / ustawa o KSC — samoidentyfikacja i gotowość zgłoszenia

> **Status:** DRAFT do decyzji zarządu + weryfikacji prawnej. **NIE stanowi opinii prawnej.**
> **Podmiot:** HVLN Dominik Kowalski (Verris). **Data:** 2026-07-04.
>
> Nowelizacja ustawy o krajowym systemie cyberbezpieczeństwa (wdrożenie dyrektywy NIS2; ustawa z 23 stycznia 2026 r.,
> Dz.U. 2026 poz. 252) weszła w życie **10 kwietnia 2026** (komunikat Ministerstwa Cyfryzacji „najważniejsze terminy”). Model **samoidentyfikacji** — to kierownictwo musi ocenić status i
> zgłosić podmiot do wykazu ministra ds. cyfryzacji, jeśli spełnia przesłanki.

## 1. Analiza statusu podmiotu

**Rodzaj działalności:** dostawca usług hostingu współdzielonego, VPS, poczty, domen —
mieści się w kategorii **„infrastruktura cyfrowa" / dostawca usług przetwarzania w chmurze i
usług centrów danych** (Załącznik do dyrektywy NIS2, sektor „Infrastruktura cyfrowa").

**Kwalifikacja (2026-09-25):** ustawa po nowelizacji (art. 5 ust. 1 pkt 4) uznaje **dostawcę usług DNS** i
**podmiot świadczący usługi rejestracji nazw domen** za podmiot kluczowy **niezależnie od wielkości**. Verris
obsługuje DNS stref klientów (własne serwery nazw) i sprzedaje domeny przez Openprovider → **podmiot kluczowy**
od dnia uruchomienia tych usług dla klientów. Decyzja właściciela (PB-24, 2026-09-23): wpis w terminie 6 miesięcy
od pierwszej domeny/strefy DNS klienta.

**Progi wielkości (ważny/kluczowy):** zależne od zatrudnienia i obrotu (mikro/mały vs średni+).
🧑‍⚖️ Do ustalenia z prawnikiem na podstawie aktualnych danych finansowych HVLN.

## 2. Terminy

| Krok | Termin |
|------|--------|
| Wejście w życie nowelizacji KSC | 10.04.2026 |
| Wykaz KSC (wykaz-ksc.gov.pl, wniosek z podpisem elektronicznym) | samorejestracja 7.05–3.10.2026 dla podmiotów spełniających przesłanki w dniu wejścia w życie |
| Wpis, gdy przesłanki spełnione później (art. 7c ust. 1) | **6 miesięcy od dnia spełnienia przesłanek** — u nas od uruchomienia DNS/domen dla klientów |
| System S46 | dostęp od 12.06.2026; koniec okresu dostosowawczego 3.04.2027 |
| Pierwszy audyt bezpieczeństwa | do 3.04.2028; kary finansowe dopiero po ostrzeżeniu, od 3.04.2028 |

## 3. 10 obszarów zarządzania ryzykiem (art. 21 NIS2) — mapowanie na stan Verris

| # | Obszar | Stan Verris | Luka / działanie |
|---|--------|-------------|------------------|
| 1 | Polityki analizy ryzyka i bezpieczeństwa SI | częściowo (audyty, raporty) | Sformalizować politykę zarządzania ryzykiem |
| 2 | Obsługa incydentów | ✔ `INCIDENT_RESPONSE.md` — sekcja „Incydent poważny” (24 h / 72 h / 1 mies., S46, rejestr, test kwartalny) | Konto w S46 po wpisie |
| 3 | Ciągłość działania, backup, zarządzanie kryzysowe | ✔ backup szyfrowany off-site + WORM + restore-drill | Udokumentować plan BCP/DR |
| 4 | Bezpieczeństwo łańcucha dostaw | częściowo (subprocesorzy, DPA) | Ocena ryzyka dostawców ICT (Stripe/OVH/DC/captcha) |
| 5 | Bezpieczeństwo nabywania, rozwoju, utrzymania | ✔ CI (lint/typecheck/testy/skany), Dependabot | Sformalizować SSDLC |
| 6 | Ocena skuteczności środków | częściowo (skany DAST, planowany pen-test) | Harmonogram audytów |
| 7 | Higiena cyber + szkolenia | do zrobienia | Program szkoleń zespołu |
| 8 | Kryptografia i szyfrowanie | ✔ AES-256-GCM, TLS, backup age, HSTS | Polityka kryptograficzna |
| 9 | Bezpieczeństwo zasobów ludzkich, kontrola dostępu, MDM | ✔ RBAC, MFA staff, VPN, audyt dostępu | Formalna polityka dostępu |
| 10 | MFA / ciągłe uwierzytelnianie, zabezpieczona komunikacja | ✔ passkeys/2FA, wymuszenie MFA staff | — |

## 4. Rekomendowane kroki (kolejność)

1. 🧑‍⚖️ Formalna decyzja zarządu o statusie podmiotu (ważny/kluczowy) — z prawnikiem.
2. Jeśli objęty: **zgłoszenie do wykazu** ministra ds. cyfryzacji przed terminem (~3.10.2026).
3. Sformalizować: politykę zarządzania ryzykiem, BCP/DR, politykę dostępu i kryptograficzną,
   program szkoleń, ocenę ryzyka łańcucha dostaw.
4. ✔ Procedura incydentów dostosowana do KSC/NIS2 (2026-09-25) — `docs/ops/INCIDENT_RESPONSE.md`.
5. Wyznaczyć osobę odpowiedzialną za cyberbezpieczeństwo (kontakt dla organu).

## 5. Rejestr do wypełnienia przy zgłoszeniu

- Nazwa/NIP/REGON: HVLN Dominik Kowalski, 9292069367, 521024260.
- Sektor: infrastruktura cyfrowa (usługi chmurowe / centra danych / [DNS/rejestrator — jeśli dotyczy]).
- Osoba kontaktowa ds. cyberbezpieczeństwa: Dominik Kowalski (właściciel, jedyna osoba z dostępem — PB-11) — do potwierdzenia przy wniosku.
- Kontakt 24/7 na potrzeby incydentów: telefon z `docs/ops/INCIDENT_RESPONSE.md` (Kontakty) + `security@verris.pl` (skrzynka do założenia — PB-03).
