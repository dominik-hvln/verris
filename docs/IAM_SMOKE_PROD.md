# IAM — smoke test na produkcji (IAM-F.3)

> Wykonaj na `panel.verris.pl` przed zamknięciem sprintu IAM-F. Zapisz datę i wynik w tabeli na końcu.

## Wymagania wstępne

- Konto właściciela (główne `USER`, bez `customerOwnerId`)
- Moduł IAM włączony (`NEXT_PUBLIC_FEATURE_IAM` ≠ `false`)
- Skrzynka testowa na zaproszenie (plus dostęp do linku aktywacji)

## Scenariusz

| # | Krok | Oczekiwany wynik | OK |
|---|------|------------------|-----|
| 1 | Właściciel: **IAM** → szablon **Support** → e-mail testowy → wyślij zaproszenie | Mail z linkiem `/accept-invite?token=…` | |
| 2 | Otwórz link, ustaw hasło, aktywuj | Przekierowanie na login `?invite=accepted` | |
| 3 | Zaloguj się jako subkonto | Menu: Dashboard, Support, Ustawienia; **brak** Portfela, Serwerów, IAM | |
| 4 | `GET https://api.verris.pl/services` z JWT subkonta | **403** | |
| 5 | Utwórz ticket w panelu | **200**, ticket widoczny | |
| 6 | Właściciel: edycja subkonta → szablon **DevOps** → zapisz | Po odświeżeniu subkonta: menu Serwery / DNS (**bez** kalkulatora — tylko właściciel) | |
| 7 | Właściciel: sekcja **Audyt IAM** | Wpis „Wysłano zaproszenie”, „Subkonto aktywowane”, „Zmiana uprawnień” | |
| 8 | Właściciel: **Wyłącz** subkonto | Sesja subkonta kończy się → **login**; ponowne logowanie zablokowane | |

## API (opcjonalnie curl)

```bash
# Token subkonta z cookie auth_token po logowaniu
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $SUB_TOKEN" \
  https://api.verris.pl/services
# Oczekiwane: 403 (przed nadaniem SERVICES_READ)
```

## Po smoke

- [x] Wszystkie kroki OK — **PASS** (2026-05-24, Dominik)
- [x] Regresja — właściciel: pełne menu i portfel
- [x] Poprawki po smoke: banner zapisu IAM, kalkulator tylko właściciel, wylogowanie wyłączonego subkonta

**Data wykonania:** 2026-05-24  
**Wykonał:** Dominik  
**Wynik:** **PASS** (mail zaproszenia / login alert w stylu Verris ✅)
