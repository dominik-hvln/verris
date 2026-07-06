# NIS2 / ustawa o KSC — samoidentyfikacja i gotowość zgłoszenia

> **Status:** DRAFT do decyzji zarządu + weryfikacji prawnej. **NIE stanowi opinii prawnej.**
> **Podmiot:** HVLN Dominik Kowalski (Verris). **Data:** 2026-07-04.
>
> Nowelizacja ustawy o krajowym systemie cyberbezpieczeństwa (wdrożenie dyrektywy NIS2) weszła w
> życie **3 kwietnia 2026**. Model **samoidentyfikacji** — to kierownictwo musi ocenić status i
> zgłosić podmiot do wykazu ministra ds. cyfryzacji, jeśli spełnia przesłanki.

## 1. Analiza statusu podmiotu

**Rodzaj działalności:** dostawca usług hostingu współdzielonego, VPS, poczty, domen —
mieści się w kategorii **„infrastruktura cyfrowa" / dostawca usług przetwarzania w chmurze i
usług centrów danych** (Załącznik do dyrektywy NIS2, sektor „Infrastruktura cyfrowa").

**Wstępna kwalifikacja:** prawdopodobnie **podmiot ważny** (important entity), a przy wzroście
skali/roli — potencjalnie **kluczowy**. Rejestratorzy domen i operatorzy DNS są klasyfikowani jako
kluczowi niezależnie od wielkości — jeśli Verris pełni funkcję operatora DNS/rejestratora, ocenić
ten aspekt osobno.

**Progi wielkości (ważny/kluczowy):** zależne od zatrudnienia i obrotu (mikro/mały vs średni+).
🧑‍⚖️ Do ustalenia z prawnikiem na podstawie aktualnych danych finansowych HVLN.

## 2. Terminy

| Krok | Termin |
|------|--------|
| Wejście w życie nowelizacji KSC | 3.04.2026 |
| Wpis do wykazu podmiotów (od spełnienia przesłanek) | 6 mies. — dla wielu firm ~**3.10.2026** |
| Wdrożenie środków zarządzania ryzykiem | w ciągu ~roku od wpisu |

## 3. 10 obszarów zarządzania ryzykiem (art. 21 NIS2) — mapowanie na stan Verris

| # | Obszar | Stan Verris | Luka / działanie |
|---|--------|-------------|------------------|
| 1 | Polityki analizy ryzyka i bezpieczeństwa SI | częściowo (audyty, raporty) | Sformalizować politykę zarządzania ryzykiem |
| 2 | Obsługa incydentów | ✔ `INCIDENT_RESPONSE.md`, procedura 72h | Dostosować raportowanie do CSIRT (terminy NIS2: wczesne ostrzeżenie 24h/72h) |
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
4. Dostosować procedurę incydentów do wymogów raportowania NIS2 (wczesne ostrzeżenie do CSIRT).
5. Wyznaczyć osobę odpowiedzialną za cyberbezpieczeństwo (kontakt dla organu).

## 5. Rejestr do wypełnienia przy zgłoszeniu

- Nazwa/NIP/REGON: HVLN Dominik Kowalski, 9292069367, 521024260.
- Sektor: infrastruktura cyfrowa (usługi chmurowe / centra danych / [DNS/rejestrator — jeśli dotyczy]).
- Osoba kontaktowa ds. cyberbezpieczeństwa: __________________.
- Dane teleadresowe do kontaktu 24/7 na potrzeby incydentów: __________________.
