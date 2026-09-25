import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Okno potwierdzenia (`potwierdz`/`zapytaj`) otwarte na początku async transition nigdy się nie pokazuje:
 * React 19 wstrzymuje aktualizacje z async transition do jej końca, a transition czeka na okno. Efekt na
 * produkcji (2026-09-25, „Oznacz jako offline” węzła): przycisk kręci się bez końca, nic się nie dzieje.
 * Po pierwszym `await` kontekst transition już nie obowiązuje, więc okno błędu po wyniku akcji jest w porządku.
 * Strażnik obejmuje trzy panele.
 */
const APPS = join(__dirname, "..", "..", "..");
const pliki = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" || n === ".next" ? [] : pliki(p);
    return p.endsWith(".tsx") ? [p] : [];
  });

function blokiTransition(s: string): string[] {
  const nazwy = [...s.matchAll(/const \[\s*\w+\s*,\s*(\w+)\s*\]\s*=\s*useTransition/g)].map((m) => m[1]);
  const bloki: string[] = [];
  for (const n of nazwy) {
    for (const m of s.matchAll(new RegExp(`\\b${n}\\(\\s*async\\s*\\(\\)\\s*=>\\s*\\{`, "g"))) {
      let i = m.index! + m[0].length;
      let d = 1;
      const start = i;
      while (d && i < s.length) {
        if (s[i] === "{") d++;
        else if (s[i] === "}") d--;
        i++;
      }
      bloki.push(s.slice(start, i));
    }
  }
  return bloki;
}

it("żadne okno potwierdzenia nie otwiera się przed pierwszym await w async transition", () => {
  const zle: string[] = [];
  for (const app of ["admin-panel", "staff-panel", "client-panel"]) {
    for (const f of pliki(join(APPS, app, "src"))) {
      const s = readFileSync(f, "utf8");
      if (!s.includes("useTransition") || !/(potwierdz|zapytaj)\(/.test(s)) continue;
      for (const b of blokiTransition(s)) {
        const pierwszy = b.search(/\bawait\b/);
        const doPierwszego = pierwszy < 0 ? b : b.slice(0, b.indexOf("(", pierwszy) + 1);
        if (/(potwierdz|zapytaj)\(/.test(doPierwszego)) zle.push(f.slice(APPS.length + 1));
      }
    }
  }
  expect(zle).toEqual([]);
});
