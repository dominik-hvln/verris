import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P-12 (WCAG 2.1 AA) — kontrast tokenów obu motywów panelu. Tekst ≥ 4,5:1 (1.4.3), grafika
 * i obramowanie fokusu ≥ 3:1 (1.4.11) na każdym tle, na którym stoją. Zmiana koloru poniżej progu = czerwony test.
 */
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');

function blokSurowy(naglowek: string): [string, string][] {
  const start = css.indexOf(naglowek);
  const tresc = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return [...tresc.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]);
}

function blok(naglowek: string): Record<string, string> {
  // Paleta bazowa z pierwszego :root (motyw jasny nadpisuje stone/body tylko dla kolumny treści).
  const baza = Object.fromEntries(blokSurowy(':root {').filter(([n]) => n.startsWith('verris-')));
  return Object.fromEntries(blokSurowy(naglowek).map(([n, v]) => [n, v.replace(/var\(--(verris-[a-z]+)\)/, (_, b: string) => baza[b] ?? '')]));
}

function luminancja(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const kontrast = (a: string, b: string) => {
  const [x, y] = [luminancja(a), luminancja(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Kolor półprzezroczysty (rgba) nałożony na tło — tak, jak go widać na ekranie. */
function naTle(kolor: string, tlo: string): string {
  const m = kolor.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return kolor;
  const alfa = m[4] === undefined ? 1 : Number(m[4]);
  return (
    '#' +
    [1, 2, 3]
      .map((i) => Math.round(Number(m[i]) * alfa + parseInt(tlo.slice(2 * i - 1, 2 * i + 1), 16) * (1 - alfa)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Kolor globalnego obrysu fokusu (`:where(a, button, …):focus-visible`) w danym motywie. */
function kolorFokusu(t: Record<string, string>): string {
  const regula = css.match(/:where\(a, button[^{]*\):focus-visible\s*\{([^}]*)\}/);
  const kolor = regula?.[1].match(/outline:\s*\d+px\s+solid\s+([^;]+);/)?.[1].trim() ?? '';
  return kolor.replace(/^var\(--([a-z0-9-]+)\)$/, (_, tok: string) => t[tok] ?? '');
}

describe.each([
  ['jasny', ':root,\n[data-vtheme="light"] .v2-content', ['background', 'card', 'raised', 'muted']],
  ['ciemny', '.dark {', ['background', 'card', 'raised']],
])('motyw %s', (_n, naglowek, tla) => {
  const t = blok(naglowek);
  it.each(['foreground', 'muted-foreground', 'data-hi', 'accent-text', 'data-text', 'warn', 'crit', 'destructive'])('tekst --%s ≥ 4,5:1', (tok) => {
    for (const tlo of tla) expect({ tlo, kontrast: kontrast(t[tok], t[tlo]) >= 4.5 }).toEqual({ tlo, kontrast: true });
  });
  it('przycisk: --destructive-foreground i --primary-foreground na swoim tle ≥ 4,5:1', () => {
    expect(kontrast(t['destructive-foreground'], t.destructive)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(t['primary-foreground'], t.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it('grafika --data ≥ 3:1', () => {
    for (const tlo of tla) expect(kontrast(t.data, t[tlo])).toBeGreaterThanOrEqual(3);
  });
  it('globalny obrys fokusu ≥ 3:1 na każdym tle (2.4.7, 1.4.11)', () => {
    const kolor = kolorFokusu(t);
    expect(kolor).not.toBe('');
    for (const tlo of tla) {
      const k = kontrast(naTle(kolor, t[tlo]), t[tlo]);
      expect({ tlo, kontrast: k >= 3 }).toEqual({ tlo, kontrast: true });
    }
  });
});

/**
 * A3-5 / A3-14 — klasy text-accent i text-data biorą kolor z tokenów tekstu, nie z --accent/--data (tło i grafika).
 * Na starym CSS: „Zmień adres e-mail” 1,48:1 u uczestników EKO (eco-tint nadpisuje --accent tłem), 1,63:1 w motywie jasnym.
 */
describe('tekst w kolorze akcentu i danych', () => {
  it('reguły .text-accent i .text-data czytają --accent-text i --data-text', () => {
    expect(css).toMatch(/\.text-accent\s*\{\s*color:\s*var\(--accent-text\);/);
    expect(css).toMatch(/\.text-data\s*\{\s*color:\s*var\(--data-text\);/);
  });
  it('eco-tint nie nadpisuje koloru tekstu akcentu, a tekst z motywu ciemnego ≥ 4,5:1 na tle EKO', () => {
    const eco = blokSurowy('html.dark.eco-tint {');
    expect(eco.map(([n]) => n)).not.toContain('accent-text');
    const ciemny = blok('.dark {');
    const baza = Object.fromEntries(blokSurowy(':root {').filter(([n]) => n.startsWith('verris-')));
    expect(kontrast(ciemny['accent-text'], baza['verris-eco'])).toBeGreaterThanOrEqual(4.5);
  });
});

