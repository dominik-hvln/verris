# Lista podmiotów przetwarzających (subprocessors) — DRAFT

> **Status:** DRAFT do lawyer review. **Wersja kanoniczna w panelu:** sekcja 4 w `privacy.md` (tabela podmiotów przetwarzających). Ten plik = źródło robocze / załącznik do paczki dla prawnika.  
> **Ostatnia aktualizacja:** 2026-07-04

| Podmiot | Siedziba / region | Cel przetwarzania | Dane |
|---------|-------------------|-------------------|------|
| **Stripe Payments Europe Ltd.** | Irlandia (EOG) | Płatności kartą, Apple/Google Pay, BLIK/P24 przez Stripe | Identyfikatory płatności, ostatnie 4 cyfry karty, status transakcji — **nie** pełny numer karty |
| **Dostawca VPS (control-plane)** | EOG (do potwierdzenia w umowie z dostawcą) | Hosting aplikacji Verris (API, panele, baza, Redis, MinIO) | Wszystkie dane przetwarzane w systemie Verris na serwerze |
| **MinIO (self-hosted na control-plane)** | Polska / EOG | Backupy Postgres (szyfrowane age), załączniki ticketów, uploady RODO | Kopie zapasowe DB, pliki użytkowników |
| **Dostawca off-site backup (S3/B2/R2)** | EOG (do potwierdzenia w umowie) | Kopie zapasowe off-site + WORM (RODO art. 32, ochrona przed ransomware) | Zaszyfrowane (age) dumpy DB — Verris trzyma klucz odszyfrowania osobno |
| **Postfix (MTA na serwerze panelu, HVLN)** | Polska / host control-plane | Domyślna wysyłka maili transakcyjnych | Adres odbiorcy, treść, status kolejki |
| **Zewnętrzny relay SMTP** (opcjonalny, admin) | EOG | Wysyłka gdy włączony tryb external w panelu | Jak wyżej — tylko jeśli skonfigurowany |
| **Google reCAPTCHA** (CAPTCHA_PROVIDER=recaptcha) | USA (Google Ireland Ltd. jako podmiot w EOG) | Ochrona anty-bot rejestracji/logowania (CYBER-2) | Adres IP, zdarzenia interakcji ze stroną logowania/rejestracji. Alternatywy przyjazne EOG: hCaptcha / Cloudflare Turnstile (przełączane configiem). |
| **Ministerstwo Finansów — KSeF** | Polska | Wystawianie faktur ustrukturyzowanych (obowiązek ustawowy, KSeF 2.0) | Dane faktur (sprzedawca, nabywca, kwoty) |
| **GlitchTip (self-hosted, CYBER-9)** | Polska / control-plane | Monitoring błędów runtime | Kontekst błędu (ścieżka, typ, userId) — **u nas**, nie zewnętrzny dostawca |
| **Compute-node (węzły hostingowe)** | EOG | Świadczenie usługi hostingowej (DirectAdmin, pliki Klienta) | Dane hostowane przez Klienta — Verris jako processor w DPA |

**Poza EOG:** jedyny potencjalny transfer to **Google reCAPTCHA** (USA) — wymaga podstawy (SCC / DPF) i wpisu w polityce prywatności + zgody cookie. 🧑‍⚖️ Do decyzji z prawnikiem: jeśli priorytetem jest brak transferu poza EOG, ustawić `CAPTCHA_PROVIDER=hcaptcha` (EU-friendly) lub `turnstile`. Stripe/SMTP/backup — wyłącznie EOG lub z SCC/DPF jeśli lawyer zatwierdzi wyjątek.

**Powiadomienia:** nowy subprocessor — e-mail do Klientów min. 30 dni wcześniej (Regulamin, DPA §7).
