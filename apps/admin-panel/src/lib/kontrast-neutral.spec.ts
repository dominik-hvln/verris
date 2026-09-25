import { readFileSync } from "node:fs";
import { join } from "node:path";

/** WCAG 1.4.3 — szary tekst pomocniczy paneli admina i obsługi ≥ 4,5:1 na tle strony i na kartach white/5. */
const lum = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const kontrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe.each(["admin-panel", "staff-panel"])("%s", (app) => {
  const css = readFileSync(join(__dirname, "..", "..", "..", app, "src", "app", "globals.css"), "utf8");
  it.each(["500", "600"])("--color-neutral-%s ≥ 4,5:1 na #0B0D17 i #171920", (odcien) => {
    const kolor = css.match(new RegExp(`--color-neutral-${odcien}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
    expect(kolor).toBeDefined();
    for (const tlo of ["#0b0d17", "#171920"]) expect(kontrast(kolor!, tlo)).toBeGreaterThanOrEqual(4.5);
  });
});
