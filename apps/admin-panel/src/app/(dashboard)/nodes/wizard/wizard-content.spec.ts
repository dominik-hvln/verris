import { readFileSync } from "fs";
import { join } from "path";

const KREATOR = readFileSync(join(__dirname, "node-wizard.tsx"), "utf8");

/**
 * PB-31 (17.10, czysta reinstalacja t2): od czystego systemu do zielonego raportu bez ręcznego SSH — na serwerze tylko
 * jedna linijka bootstrapu. Krok „Wymagania” podsuwał ręczne `dnf update` / `hostnamectl`, a pole hostname kazało dodać
 * rekord A w OVH, choć oba robi automat (PREFLIGHT bootstrapu; NodeDnsService przy Canary i zatwierdzeniu).
 */
describe("kreator węzła — bez kroków ręcznych na serwerze i w OVH", () => {
  it("krok „Wymagania” nie podsuwa poleceń do wykonania na serwerze", () => {
    expect(KREATOR).not.toContain("Krok 0 — przygotowanie OS");
    expect(KREATOR).not.toContain("przygotowanieOs");
    expect(KREATOR).toContain("bez ręcznych poleceń");
  });

  it("pole hostname nie każe dodawać rekordu A w OVH ręcznie", () => {
    expect(KREATOR).not.toContain("Dodaj rekord A w OVH");
    expect(KREATOR).toContain("zakładają się w OVH same");
  });
});

/**
 * 19.10 — decyzja 17.10 (PB-31): na węzłach tylko certyfikat Let's Encrypt nazwy hosta z DA, bez wildcardu *.verris.pl.
 * Definition of Done i pole hostname wymagały jeszcze wildcardu — warunek, którego żaden węzeł już nie spełni.
 */
describe("kreator węzła — certyfikat panelu bez wildcardu", () => {
  it("DoD i pole hostname nie wymagają wildcardu *.verris.pl", async () => {
    const { DOD_ACTIVE_CHECKLIST } = await import("./wizard-content");
    expect(DOD_ACTIVE_CHECKLIST.join("\n")).not.toMatch(/wildcard/i);
    expect(DOD_ACTIVE_CHECKLIST.join("\n")).toContain("Let's Encrypt dla nazwy hosta");
    expect(KREATOR).not.toMatch(/wildcard <code>\*\.verris\.pl/);
  });
});
