# Kreator stron — zakres i MVP (CMP-4)

dhosting/Hostinger mają AI Site Builder (niski próg dla klienta bez WordPressa). My
mamy WP 1-klik, „stronę w 5 krokach", marketplace (Nextcloud/PrestaShop) i stronę
domyślną. Brakuje **budowania strony bez zewnętrznego CMS**. Pełny builder to duży
projekt — robimy go fazowo, nie blokując startu.

## Faza 1 (MVP, szybkie) — Starter Templates 1-klik
Wykorzystujemy to, co już mamy (`default-hosting-page.assets`, `APP_INSTALL`, profil
hostingowy). Klient wybiera **gotowy szablon** (landing/wizytówka/portfolio/sklep-lite)
→ deploy 1 kliknięciem na konto + edycja podstaw (logo, teksty, kolory, kontakt) przez
prosty formularz. Bez pełnego edytora WYSIWYG. Koszt: mały/średni. Zamyka ~70% potrzeb
„chcę szybko mieć stronę".

## Faza 2 — Edytor wizualny (no-code)
Integracja sprawdzonego open-source, np. **GrapesJS** (edytor blokowy, MIT) osadzony w
panelu, zapis do statycznego HTML/na konto. Alternatywa: kuratorowane **motywy blokowe
WordPress** + Gutenberg jako „builder" (jeśli stawiamy na WP). Decyzja zależy od tego,
czy chcemy własny edytor (większa kontrola, więcej pracy) czy ekosystem WP (szybciej).

## Faza 3 — „autorskie algorytmy"
Generowanie szkicu strony z kilku odpowiedzi (branża, nazwa, sekcje) → wstępny układ z
naszych szablonów. To realny, uczciwy „autorski mechanizm" (nie kupowane AI), spójny z
naszym pozycjonowaniem.

## Rekomendacja
Faza 1 teraz (duży efekt, mały koszt), Faza 2 po starcie (z rundy), Faza 3 jako
wyróżnik. Nie budujemy pełnego edytora przed launchem — to by opóźniło start.
