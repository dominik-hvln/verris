/**
 * KB-SEO-4 — wzorzec brandingowy baneru CTA (autorski znak „V" Verris).
 * Gęsta, zazębiona siatka znaku (krok mniejszy niż znak → znaki nachodzą na
 * siebie, jak w dostarczonym assecie marki), naprzemienne obroty up/down.
 * Bezszwowy: motyw jest replikowany na sąsiednie kafle (3×3), więc CSS
 * `background-repeat: repeat` nie tworzy widocznych szwów. Znaki #0F7A52
 * (zielone), akcent mint #34E5A0, tło przezroczyste — baner nakłada wzorzec na
 * własny gradient pine. Serwowany przez BrandController jako /brand/cta-pattern.svg.
 */
const MARK =
  '<path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#0F7A52" fill-rule="evenodd"/>' +
  '<path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="#34E5A0" stroke-width="1.6"/>';

function buildPattern(): string {
  const hx = 31;
  const vy = 52;
  const Px = 2 * hx;
  const Py = 2 * vy;
  // 4 znaki w komórce okresu (2 up, 2 down w układzie szachownicy)
  const base: Array<[number, number, number]> = [
    [0, 0, 0],
    [hx, 0, 180],
    [0, vy, 180],
    [hx, vy, 0],
  ];
  let g = '';
  for (const [x, y, rot] of base) {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cx = x + i * Px;
        const cy = y + j * Py;
        const r = rot ? ` rotate(${rot})` : '';
        g += `<g transform="translate(${cx} ${cy})${r} translate(-50 -54)">${MARK}</g>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Px} ${Py}">${g}</svg>`;
}

export const CTA_PATTERN_SVG = buildPattern();
