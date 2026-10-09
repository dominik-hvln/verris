import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DzialaniaWezla, dzialaniaWezla } from "./dzialania-wezla";

/** 10.10 — Onboard LIVE dla istniejącego węzła był tylko w kreatorze; Dominik nie mógł go znaleźć. */
describe("Działania węzła na karcie", () => {
  it("aktywny węzeł: Onboard LIVE i aktualizacja stosu prowadzą do zakładki Aktualizacje", () => {
    const html = renderToStaticMarkup(<DzialaniaWezla baza="/nodes/w1" dziala instalacja={false} />);
    expect(html).toContain("Onboard LIVE");
    expect(html).toContain('href="/nodes/w1?sekcja=aktualizacje#onboard-live"');
    expect(html).toContain('href="/nodes/w1?sekcja=aktualizacje#stos"');
    expect(html).not.toContain("#bootstrap");
  });

  it("węzeł w instalacji: tylko instalacja i historia zadań", () => {
    const nazwy = dzialaniaWezla("/nodes/w1", { dziala: false, instalacja: true }).map((d) => d.nazwa);
    expect(nazwy).toEqual(["Instalacja węzła", "Historia zadań"]);
  });

  it("każda kotwica z listy istnieje na stronie węzła", () => {
    const strona = readFileSync(join(__dirname, "page.tsx"), "utf8");
    for (const d of dzialaniaWezla("/nodes/w1", { dziala: true, instalacja: true })) {
      const kotwica = d.href.split("#")[1];
      if (kotwica) expect(strona).toContain(`id="${kotwica}"`);
    }
  });
});
