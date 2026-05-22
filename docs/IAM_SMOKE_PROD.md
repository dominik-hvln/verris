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
| 6 | Właściciel: edycja subkonta → szablon **DevOps** → zapisz | Po odświeżeniu subkonta: menu Serwery / DNS itd. | |
| 7 | Właściciel: sekcja **Audyt IAM** | Wpis „Wysłano zaproszenie”, „Subkonto aktywowane”, „Zmiana uprawnień” | |
| 8 | Właściciel: **Wyłącz** subkonto | Kolejny request subkonta → **401/403** | |

## API (opcjonalnie curl)

```bash
# Token subkonta z cookie auth_token po logowaniu
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $SUB_TOKEN" \
  https://api.verris.pl/services
# Oczekiwane: 403 (przed nadaniem SERVICES_READ)
```

## Po smoke

- [ ] Wszystkie kroki OK — oznacz IAM-F.3 jako DONE w `PROPOSED_SPRINTS.md`
- [ ] Regresja — właściciel nadal widzi pełne menu i portfel

**Data wykonania:** ___________  
**Wykonał:** ___________  
**Wynik:** PASS / FAIL (notatki): ___________
