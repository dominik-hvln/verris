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

describe.each([
  ['jasny', ':root,\n[data-vtheme="light"] .v2-content', ['background', 'card', 'raised', 'muted']],
  ['ciemny', '.dark {', ['background', 'card', 'raised']],
])('motyw %s', (_n, naglowek, tla) => {
  const t = blok(naglowek);
  it.each(['foreground', 'muted-foreground', 'data-hi', 'warn', 'crit', 'destructive'])('tekst --%s ≥ 4,5:1', (tok) => {
    for (const tlo of tla) expect({ tlo, kontrast: kontrast(t[tok], t[tlo]) >= 4.5 }).toEqual({ tlo, kontrast: true });
  });
  it('przycisk: --destructive-foreground i --primary-foreground na swoim tle ≥ 4,5:1', () => {
    expect(kontrast(t['destructive-foreground'], t.destructive)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(t['primary-foreground'], t.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it('grafika --data ≥ 3:1', () => {
    for (const tlo of tla) expect(kontrast(t.data, t[tlo])).toBeGreaterThanOrEqual(3);
  });
});
