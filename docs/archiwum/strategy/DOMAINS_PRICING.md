# Domeny — katalog i konkurencyjne ceny (CMP-6)

Fundament mamy: `registrar-tld-catalog.ts` (katalog TLD), `domain-pricing.util.ts`
(hurt × markup), `nbp-fx.service.ts` (przeliczanie walut), rejestracja domeny w
checkout. CMP-6 to głównie **decyzje cenowe + szerokość katalogu**, nie nowy silnik.

## 1. Katalog — które TLD na start
Must-have: **.pl, .com.pl, .com, .eu, .net, .org, .info, .shop, .sklep, .online,
.site, .dev, .io, .pro, .biz, .xyz**. Rozszerzenia branżowe dokładamy wg popytu.

## 2. Polityka cenowa (przewaga, nie wojna cenowa)
- **Promo 1. roku** na .pl/.com (jak rynek), ale **uczciwe, transparentne odnowienie**
  — to nasz hak: konkurencja zawyża odnowienia, my pokazujemy cenę odnowienia wprost
  przy zakupie. To spójne z całą narracją „brak pułapki cenowej".
- **Markup per TLD** (zamiast jednego globalnego) — `domain-pricing.util` już wspiera
  markup; rozbić na mapę per TLD, by trzymać marżę tam, gdzie hurt jest tani.
- **Bundle domena + hosting**: darmowa domena .pl/.com przy planie rocznym (klasyczny
  hak akwizycyjny) — finansowane z marży hostingu.

## 3. Małe domknięcia w kodzie (sized)
- Mapa `markup`/promo **per TLD** + flaga „promo 1. roku" w katalogu — mały.
- Widoczna **cena odnowienia obok ceny startowej** w checkout — mały (UX uczciwości).
- Filtr/wyszukiwarka TLD + sugestie alternatyw, gdy domena zajęta — śr.

## 4. Czego nie robić
Nie wchodzić w dumping (.pl za grosze) — gramy wartością (bundle, transparentność,
jeden portfel na domeny+hosting+pocztę). Cena ma być **konkurencyjna, nie najniższa**.
