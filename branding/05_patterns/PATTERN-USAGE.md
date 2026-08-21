# Verris — Pattern (zasady użycia)

Pattern to znak P3 w siatce diamentów (szachownica ∧/∨ z monogramu).

## Warianty
- **uniform** — równa, gęsta siatka (tło sekcji, materiały).
- **shrink-right / shrink-down** — znak i odstęp maleją w prawo / w dół (krzywa 0.78, dół ~50%).
- **opacity** — od środka ku prawemu-dolnemu rogowi krycie maleje.

## Parametry kanoniczne
- Rozstaw kolumn startowy: `P0 × colF`, colF **0.60–0.70** (gęsto). Rozstaw pionowy = `P0`.
- Skala znaku: `P × 0.94 / 48`. Wcięcie zawsze pokazuje kolor tła (evenodd).

## Zasady
- Jako **tło**: pełna szerokość, ~1/2 (lub 1/3) wysokości, zanikanie maską `linear-gradient(to bottom,#000 0,#000 30%,transparent 56%)`.
- **Opacity tła** w layoutach: 6–14% pod treścią, do 100% jako element dekoracyjny/hero.
- Kolory: biały znak na Pine (podstawowy), Green na Pine, Mint oszczędnie. Na jasnym — Pine na Paper.
- Nie obracać pojedynczych znaków poza szachownicą ∧/∨. Nie mieszać kolorów w jednej siatce.
