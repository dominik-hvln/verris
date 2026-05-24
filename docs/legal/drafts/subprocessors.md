# Lista podmiotów przetwarzających (subprocessors) — DRAFT

> **Status:** DRAFT do lawyer review. **Wersja kanoniczna w panelu:** sekcja 4 w `privacy.md` (tabela podmiotów przetwarzających). Ten plik = źródło robocze / załącznik do paczki dla prawnika.  
> **Ostatnia aktualizacja:** 2026-05-24

| Podmiot | Siedziba / region | Cel przetwarzania | Dane |
|---------|-------------------|-------------------|------|
| **Stripe Payments Europe Ltd.** | Irlandia (EOG) | Płatności kartą, Apple/Google Pay, BLIK/P24 przez Stripe | Identyfikatory płatności, ostatnie 4 cyfry karty, status transakcji — **nie** pełny numer karty |
| **Dostawca VPS (control-plane)** | EOG (do potwierdzenia w umowie z dostawcą) | Hosting aplikacji Verris (API, panele, baza, Redis, MinIO) | Wszystkie dane przetwarzane w systemie Verris na serwerze |
| **MinIO (self-hosted na control-plane)** | Polska / EOG | Backupy Postgres, załączniki ticketów, uploady RODO | Kopie zapasowe DB, pliki użytkowników |
| **Postfix (MTA na serwerze panelu, HVLN)** | Polska / host control-plane | Domyślna wysyłka maili transakcyjnych | Adres odbiorcy, treść, status kolejki |
| **Zewnętrzny relay SMTP** (opcjonalny, admin) | EOG | Wysyłka gdy włączony tryb external w panelu | Jak wyżej — tylko jeśli skonfigurowany |
| **Compute-node (węzły hostingowe)** | EOG | Świadczenie usługi hostingowej (DirectAdmin, pliki Klienta) | Dane hostowane przez Klienta — Verris jako processor w DPA |

**Poza EOG:** brak planowanych transferów. Stripe i SMTP — wyłącznie podmioty z siedzibą w EOG lub z SCC/DPF jeśli lawyer zatwierdzi wyjątek.

**Powiadomienia:** nowy subprocessor — e-mail do Klientów min. 30 dni wcześniej (Regulamin, DPA §7).
