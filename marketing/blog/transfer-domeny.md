---
title: "Transfer domeny do innego rejestratora krok po kroku"
slug: "transfer-domeny"
excerpt: "Transfer domeny brzmi groźnie, a sprowadza się do kodu authinfo i potwierdzenia. Wyjaśniamy przebieg, warunki i to, czy transfer jest w ogóle potrzebny."
metaTitle: "Transfer domeny krok po kroku — jak przenieść domenę | Verris"
metaDescription: "Jak przenieść domenę do innego rejestratora: kod authinfo, warunki transferu, czas trwania i czy strona przestanie działać. Kiedy transfer nie jest potrzebny."
keyword: "transfer domeny"
cluster: "Domeny"
type: "spoke"
status: "draft"
faq: [{"q": "Czy transfer przedłuża ważność domeny?", "a": "Przy wielu końcówkach transfer dodaje rok do okresu ważności. Szczegóły zależą od rejestru."}, {"q": "Ile kosztuje transfer?", "a": "Zależy od końcówki — aktualne stawki sprawdzisz w panelu."}]
---

# Transfer domeny do innego rejestratora krok po kroku

**W skrócie:** transfer domeny polega na pobraniu kodu **authinfo** od obecnego rejestratora, zleceniu transferu u nowego i potwierdzeniu operacji. Domena przez cały czas działa — transfer nie wyłącza strony ani poczty, bo te zależą od rekordów DNS, a nie od tego, kto prowadzi rejestrację.

## Czy transfer jest w ogóle potrzebny?

Najczęściej **nie**. Żeby uruchomić stronę na nowym hostingu, wystarczy [zmienić rekordy DNS](/blog/zmiana-dns) — domena może zostać tam, gdzie jest. Transfer robisz wtedy, gdy chcesz mieć wszystko w jednym panelu i jednych fakturach.

## Warunki, które trzeba spełnić

- Domena jest zarejestrowana od co najmniej 60 dni (typowa reguła).
- Nie jest zablokowana (status „transfer lock").
- Masz dostęp do adresu e-mail kontaktowego domeny.
- Domena nie wygasa za kilka dni (transfer w ostatniej chwili to proszenie się o kłopoty).

## Przebieg krok po kroku

1. **Odblokuj domenę** w panelu obecnego rejestratora.
2. **Pobierz kod authinfo** (nazywany też EPP/auth code).
3. **Zleć transfer** u nowego rejestratora, podając kod.
4. **Potwierdź** operację — zwykle mailem na adres kontaktowy domeny.
5. **Poczekaj** na zakończenie (od kilku godzin do kilku dni, zależnie od końcówki).
6. **Sprawdź rekordy DNS** po transferze — czasem trzeba je uzupełnić ponownie.

## Czy strona przestanie działać?

Nie, o ile rekordy DNS pozostaną te same. Największe ryzyko to **utrata rekordów** przy zmianie serwerów nazw — dlatego zanotuj je przed transferem i porównaj po.

## Pułapka odnowień

Zanim przeniesiesz domenę, sprawdź, czy u obecnego rejestratora nie odnowi się automatycznie w trakcie procesu. W Verris [domeny odnawiamy wyłącznie po opłaceniu](/domeny), z przypomnieniami 30, 14 i 7 dni przed wygaśnięciem — nigdy „z karty, bo tak".

## FAQ

**Czy transfer przedłuża ważność domeny?**
Przy wielu końcówkach transfer dodaje rok do okresu ważności. Szczegóły zależą od rejestru.

**Ile kosztuje transfer?**
Zależy od końcówki — aktualne stawki sprawdzisz w panelu.

---

*Chcesz mieć domenę i hosting w jednym panelu? [Zobacz domeny w Verris](/domeny).*
