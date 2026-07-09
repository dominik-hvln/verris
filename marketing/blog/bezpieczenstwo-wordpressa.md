---
title: "Bezpieczeństwo WordPressa — 10 rzeczy, które musisz ustawić"
slug: "bezpieczenstwo-wordpressa"
excerpt: "Większość włamań na WordPressa to nie wyrafinowany atak, tylko nieaktualna wtyczka i słabe hasło. Dziesięć ustawień, które zamykają najczęstsze furtki."
metaTitle: "Bezpieczeństwo WordPressa — 10 rzeczy do ustawienia | Verris"
metaDescription: "Jak zabezpieczyć WordPressa: aktualizacje, hasła i 2FA, ograniczenie logowania, kopie zapasowe, SSL, uprawnienia plików. Praktyczna lista bez ściemy."
keyword: "bezpieczeństwo wordpress"
cluster: "WordPress"
type: "spoke"
status: "draft"
faq: [{"q": "Czy hosting zabezpieczy mnie sam?", "a": "Hosting odpowiada za izolację kont, szyfrowanie i kopie. Za wtyczki, hasła i uprawnienia odpowiadasz Ty."}, {"q": "Co zrobić po włamaniu?", "a": "Przywróć czystą kopię zapasową, zmień wszystkie hasła, zaktualizuj wszystko i dopiero potem szukaj przyczyny."}]
---

# Bezpieczeństwo WordPressa — 10 rzeczy, które musisz ustawić

**W skrócie:** zdecydowana większość przejęć stron na WordPressie wynika z nieaktualnych wtyczek, słabych haseł i braku kopii zapasowej. Nie potrzebujesz eksperta od bezpieczeństwa — potrzebujesz dyscypliny w dziesięciu prostych punktach.

## 1. Aktualizuj — WordPressa, motyw i wtyczki

To jedno działanie eliminuje większość ryzyka. Aktualizuj regularnie, ale **zawsze po kopii zapasowej**.

## 2. Usuń to, czego nie używasz

Nieaktywna wtyczka nadal leży na serwerze i może zawierać podatność. Kasuj, nie dezaktywuj.

## 3. Silne, unikalne hasła

Menedżer haseł, nie „Firma2026!". Osobne hasła do panelu WP, hostingu i bazy.

## 4. Dwuskładnikowe logowanie (2FA)

Najskuteczniejsza pojedyncza zmiana po aktualizacjach. Włącz dla każdego konta administratora.

## 5. Ogranicz próby logowania

Blokada po kilku nieudanych próbach ucina ataki słownikowe. Zmień też domyślną nazwę użytkownika `admin`.

## 6. Minimalne uprawnienia

Redaktor nie potrzebuje roli administratora. Im mniej kont z pełnymi prawami, tym mniejsza powierzchnia ataku.

## 7. HTTPS wszędzie

[Certyfikat SSL](/funkcje/ssl) szyfruje logowanie i formularze. W Verris jest w cenie — nie ma powodu, by go nie mieć.

## 8. Kopie zapasowe, które umiesz przywrócić

Backup to nie „ustaw i zapomnij". Sprawdź, czy potrafisz **odtworzyć** stronę. W Verris robisz to [samodzielnie w panelu](/funkcje/kopie-zapasowe), bez czekania na support.

## 9. Aktualna wersja PHP

Stare wersje nie dostają poprawek bezpieczeństwa. Jeśli wtyczka wymaga starszej, [traktuj to jako dług do spłaty](/blog/wordpress-wersja-php), nie stan docelowy.

## 10. Ogranicz dostęp do plików konfiguracyjnych

`wp-config.php` i katalog `wp-admin` nie powinny być dostępne szerzej, niż to konieczne. Sprawdź uprawnienia plików (typowo 644 dla plików, 755 dla katalogów).

## Czego nie robić

Nie instaluj pięciu wtyczek „security" naraz — spowolnią stronę i będą się gryźć. Nie ukrywaj wersji WordPressa zamiast aktualizować; to teatr bezpieczeństwa.

## FAQ

**Czy hosting zabezpieczy mnie sam?**
Hosting odpowiada za izolację kont, szyfrowanie i kopie. Za wtyczki, hasła i uprawnienia odpowiadasz Ty.

**Co zrobić po włamaniu?**
Przywróć czystą kopię zapasową, zmień wszystkie hasła, zaktualizuj wszystko i dopiero potem szukaj przyczyny.

---

*Kopie, SSL i izolacja kont są w cenie — [zobacz hosting WordPress](/hosting/wordpress).*
