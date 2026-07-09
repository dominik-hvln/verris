---
title: "Certyfikat SSL w sklepie — dlaczego jest obowiązkowy"
slug: "ssl-sklep-internetowy"
excerpt: "Bez HTTPS przeglądarka ostrzega klienta przy wpisywaniu danych karty. Wyjaśniamy, po co SSL w sklepie, jaki typ wystarczy i czy trzeba za niego płacić."
metaTitle: "Certyfikat SSL w sklepie internetowym — czy jest obowiązkowy? | Verris"
metaDescription: "Po co SSL w sklepie: szyfrowanie płatności, zaufanie klienta, SEO. Który certyfikat wystarczy, ile kosztuje i dlaczego Let's Encrypt to standard."
keyword: "ssl sklep internetowy"
cluster: "E-commerce"
type: "spoke"
status: "draft"
faq: [{"q": "Czy SSL spowolni sklep?", "a": "Nie w praktyce — nowoczesne szyfrowanie jest tanie obliczeniowo, a HTTP/2 (dostępny tylko po HTTPS) potrafi wręcz przyspieszyć ładowanie."}, {"q": "Czy potrzebuję osobnego certyfikatu na subdomeny?", "a": "Zależy od konfiguracji — certyfikat może obejmować kilka nazw. Sprawdzisz to w panelu."}]
---

# Certyfikat SSL w sklepie — dlaczego jest obowiązkowy

**W skrócie:** SSL szyfruje połączenie między przeglądarką klienta a Twoim sklepem. Bez niego przeglądarka oznacza stronę jako „niezabezpieczoną", a dane logowania i płatności lecą otwartym tekstem. Dla sklepu HTTPS nie jest opcją — to warunek działania.

## Co konkretnie daje SSL

- **Szyfrowanie** danych logowania, formularzy i płatności.
- **Zaufanie** — kłódka zamiast ostrzeżenia „Niezabezpieczona".
- **SEO** — HTTPS jest sygnałem rankingowym, a strony bez niego tracą.
- **Zgodność** — bramki płatnicze wymagają HTTPS.

## Jaki certyfikat wystarczy sklepowi

Dla zdecydowanej większości sklepów wystarczy **certyfikat DV** (Domain Validation) — potwierdza, że kontrolujesz domenę. Certyfikaty OV/EV (z weryfikacją firmy) są droższe i dziś nie dają widocznej przewagi wizualnej w przeglądarkach.

**Let's Encrypt** to darmowy urząd certyfikacji wydający certyfikaty DV, odnawiane automatycznie. Technicznie szyfrują tak samo jak certyfikaty płatne.

## Czy trzeba płacić?

Nie. Bezpłatny SSL jest standardem — problemem bywa to, że część dostawców traktuje go jako **płatny dodatek przy odnowieniu**. W Verris [certyfikat SSL jest w cenie hostingu](/funkcje/ssl), wystawiany i odnawiany automatycznie.

## Częste błędy przy wdrożeniu

- **Mixed content** — strona po HTTPS, ale obrazy i skrypty ładowane po HTTP. Przeglądarka pokaże ostrzeżenie.
- **Brak przekierowania** z HTTP na HTTPS (i z `www` na wersję kanoniczną).
- **Nieodnowiony certyfikat** — stąd wartość automatycznego odnawiania.

Po wdrożeniu SSL sprawdź kluczowe ścieżki sklepu: logowanie, koszyk, checkout, powrót z bramki płatniczej.

## FAQ

**Czy SSL spowolni sklep?**
Nie w praktyce — nowoczesne szyfrowanie jest tanie obliczeniowo, a HTTP/2 (dostępny tylko po HTTPS) potrafi wręcz przyspieszyć ładowanie.

**Czy potrzebuję osobnego certyfikatu na subdomeny?**
Zależy od konfiguracji — certyfikat może obejmować kilka nazw. Sprawdzisz to w panelu.

---

*SSL, kopie i skalowanie w jednej cenie — [zobacz hosting pod sklep](/hosting/sklep).*
