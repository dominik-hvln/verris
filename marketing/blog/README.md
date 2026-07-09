# Verris — drafty bloga (32 wpisy, wszystkie klastry domknięte)

Pełne, gotowe do publikacji wpisy (Markdown z frontmatter). Każdy ma: blok „W skrócie" (40–60 słów,
pod AI Overviews i cytowania), H2/H3 sformułowane jak zapytania użytkownika, tabele/listy tam gdzie
pomagają, FAQ, linkowanie wewnętrzne (hub-and-spoke) i CTA.

Compliance: ceny brutto, SLA 99,5%, „bez limitu" z notą fair use, brak green claims, brak nazw
konkurentów. Przed publikacją → `marketing:brand-review`.

## Zawartość

| Klaster | Pillar | Spoke'y |
|---|---|---|
| Migracja | jak-przeniesc-strone-na-inny-hosting | jak-przeniesc-wordpress-na-nowy-hosting, zmiana-hostingu-a-seo, migracja-poczty, zmiana-dns, ile-trwa-przeniesienie-strony |
| Koszty | ile-kosztuje-hosting | autoskalowanie-hostingu, drogie-odnowienie-hostingu, pakiet-vs-zuzycie, hosting-black-friday |
| WordPress | najlepszy-hosting-pod-wordpress | przyspieszanie-wordpressa, bezpieczenstwo-wordpressa, wordpress-wersja-php |
| Domeny | jak-wybrac-domene | transfer-domeny, pl-czy-com, odnowienie-domeny |
| E-commerce | hosting-woocommerce | sklep-nie-wyrabia-ruchu, ssl-sklep-internetowy |
| Bezpieczeństwo / uptime | rodo-a-hosting | co-to-jest-sla, kopie-zapasowe-strony, analityka-bez-cookies, serwery-w-ue-rodo |
| Wybór hostingu | jak-wybrac-hosting-dla-malej-firmy | vps-czy-hosting-wspoldzielony, hosting-z-faktura-ksef, hosting-reseller, slownik-pojec-hostingowych |

## Narzędzia

**Obrazki wyróżniające** — cover 1200×630 w `images/<slug>.png` (kanoniczny pattern marki z
`apps/www/public/pattern.svg`, logo, kategoria w ramce, tytuł, stopka):

```bash
python3 generate_covers.py     # generuje dla wszystkich wpisów
```

**FAQ → schema FAQPage** — wyciąga sekcję `## FAQ` do pola `faq` we frontmatterze (JSON):

```bash
python3 extract_faq.py         # aktualizuje frontmatter wszystkich wpisów
```

## Jak opublikować wpis

1. **Media** → wgraj `images/<slug>.png` (uzupełnij tekst alt).
2. **Posts** → nowy wpis: `title`, `slug`, `excerpt`, treść (wklej body bez frontmatter),
   *Obraz wyróżniający* = wgrany cover.
3. Sidebar: `author`, `keyword`, `cluster`, `type`, data publikacji.
4. Pole **FAQ (schema FAQPage)** → wklej wartość `faq` z frontmatter (gotowy JSON).
5. Pola SEO: `metaTitle` → *Meta title*, `metaDescription` → *Meta description*.
6. Status **Published**.

Wpis automatycznie emituje `BlogPosting` + `BreadcrumbList`, a przy wypełnionym `faq` również
`FAQPage`. Listing `/blog` emituje `Blog` + `ItemList`.

## Uwaga o słowach kluczowych

Wpisy celują w **jedną frazę główną** (`keyword`) plus jej naturalne warianty semantyczne.
Świadomie **nie upychamy** słów kluczowych: wg badań GEO (Princeton, KDD 2024) keyword stuffing
obniża widoczność o **−10%**, podczas gdy cytowanie źródeł daje +40%, statystyki +37%,
a poprawa klarowności +20%. Google traktuje upychanie jako spam. Dlatego optymalizacja idzie przez
pokrycie tematu, strukturę i dane — nie przez gęstość fraz.
