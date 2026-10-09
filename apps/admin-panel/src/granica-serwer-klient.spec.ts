import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Granica Server/Client Components (produkcja 09.10): karta klienta w adminie (Server Component) wywoływała
 * opisStatusuVat() zaimportowaną z modułu "use client". Build i testy jednostkowe przechodziły, a na żywo każda
 * karta klienta kończyła się „Nie udało się wczytać tej strony” (React #441) — funkcji z modułu klienckiego nie da
 * się wywołać na serwerze. Komponenty (wielka litera) i typy można importować; zwykłe funkcje/stałe — nie.
 *
 * Skanujemy trzy panele: plik bez "use client" (serwerowy) nie może importować nazwy zaczynającej się małą literą
 * z lokalnego modułu z "use client".
 */
const APPS = ["admin-panel", "staff-panel", "client-panel"].map((a) => resolve(__dirname, "..", "..", a, "src"));
const ROZSZ = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function pliki(kat: string, out: string[] = []): string[] {
  for (const n of readdirSync(kat)) {
    if (n === "node_modules" || n === ".next" || n === "generated") continue;
    const p = join(kat, n);
    if (statSync(p).isDirectory()) pliki(p, out);
    else if (/\.(tsx?|jsx?)$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}

const KLIENCKI = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use client["']/;
const czyKliencki = (kod: string) => KLIENCKI.test(kod);

function rozwiaz(zPliku: string, spec: string, src: string): string | null {
  const baza = spec.startsWith("@/") ? join(src, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(zPliku), spec) : null;
  if (!baza) return null;
  for (const r of ["", ...ROZSZ]) {
    const p = baza + r;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function naruszenia(src: string): string[] {
  const zle: string[] = [];
  const cache = new Map<string, boolean>();
  for (const plik of pliki(src)) {
    const kod = readFileSync(plik, "utf8");
    if (czyKliencki(kod)) continue;
    for (const m of kod.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      if (m[1]) continue; // import type { … }
      const cel = rozwiaz(plik, m[3], src);
      if (!cel) continue;
      if (!cache.has(cel)) cache.set(cel, czyKliencki(readFileSync(cel, "utf8")));
      if (!cache.get(cel)) continue;
      for (const nazwa of m[2].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (nazwa.startsWith("type ")) continue;
        const lokalna = nazwa.split(/\s+as\s+/)[0].trim();
        if (/^[a-z_$]/.test(lokalna)) zle.push(`${plik.slice(src.length - 20)} → ${lokalna} z ${m[3]}`);
      }
    }
  }
  return zle;
}

describe("granica Server/Client Components", () => {
  it.each(APPS)("%s: serwer nie importuje funkcji z modułów \"use client\"", (src) => {
    expect(naruszenia(src)).toEqual([]);
  });
});
