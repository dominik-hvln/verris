import { renderToStaticMarkup } from "react-dom/server";
import { PrognozaWezlaKarta } from "./prognoza-wezla";
import type { PrognozaWezla } from "./przeglad-data";

const historia = [
  { t: "2026-10-05T10:00:00.000Z", v: 60 },
  { t: "2026-10-05T11:00:00.000Z", v: 62 },
];
const prognoza = (z: Partial<PrognozaWezla> = {}): PrognozaWezla => ({
  generatedAt: "2026-10-05T12:00:00.000Z",
  dostepna: true,
  confidence: "high",
  horizonDays: 7,
  resources: [
    { resource: "CPU", currentPct: 31, predictedPct: 33, daysToLimit: null, historia },
    { resource: "RAM", currentPct: 62, predictedPct: 76, daysToLimit: 19, historia },
    { resource: "DISK", currentPct: 81, predictedPct: 95, daysToLimit: 6, historia },
  ],
  oknoAktualizacji: { godzina: 3, cpuProc: 4 },
  zapas: { kont: 12, wymiar: "RAM", noweKonta30d: 6, dniDoWyczerpania: 60 },
  kandydaci: [{ etykieta: "konto 1", accountId: "a1", domena: "piekarnia-zdroj.pl", subscriptionId: "s1", udzialProc: 48, mocWezlaProc: 15 }],
  sygnaly: [{ ton: "crit", tekst: "Limit dysku za ~6 dni" }],
  podsumowanie: "Dysk zapełni się pierwszy.",
  zalecenia: ["Przenieś konto piekarnia-zdroj.pl na fsn-02."],
  komentarzAi: true,
  ...z,
});
const render = (p: PrognozaWezla) => {
  const html = renderToStaticMarkup(<PrognozaWezlaKarta p={p} bazaHref="/nodes/w1" />);
  return { html, tekst: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
};

describe("Karta „Prognoza węzła”", () => {
  it("liczby panelu, okno aktualizacji, zapas, sygnały, Przenieś do migracji wewnętrznej, prognoza przerywaną linią", () => {
    const { html, tekst } = render(prognoza());
    expect(tekst).toContain("Prognoza węzła");
    expect(tekst).toContain("62% → 76%");
    expect(tekst).toContain("limit za ~19 dni");
    expect(tekst).toContain("limit za ~6 dni");
    expect(tekst).toContain("03:00, śr. 4% CPU");
    expect(tekst).toContain("zmieści jeszcze ok. 12 kont");
    expect(tekst).toContain("ok. 60 dni");
    expect(tekst).toContain("Limit dysku za ~6 dni");
    expect(tekst).toContain("piekarnia-zdroj.pl 48%");
    expect(html).toContain('href="/subscriptions/s1#migracja-wewnetrzna"');
    expect(html.match(/data-prognoza/g)).toHaveLength(3);
    expect(html.match(/role="slider"/g)).toHaveLength(3);
  });

  it("notka AI i data-ai-generated tylko przy komentarzu AI", () => {
    const zAi = render(prognoza());
    expect(zAi.tekst).toContain("Zalecenia tworzy AI — decyzję podejmuje operator.");
    expect(zAi.html.match(/data-ai-generated="true"/g)).toHaveLength(2);

    const bezAi = render(prognoza({ komentarzAi: false, zalecenia: [], podsumowanie: "Najbliżej limitu: dysk — 81% teraz." }));
    expect(bezAi.tekst).toContain("Najbliżej limitu: dysk");
    expect(bezAi.tekst).not.toContain("Zalecenia tworzy AI");
    expect(bezAi.html).not.toContain("data-ai-generated");
  });

  it("za mało danych — bez wykresów, z opisem panelu", () => {
    const { html, tekst } = render(prognoza({ dostepna: false, resources: [], oknoAktualizacji: null, kandydaci: [], komentarzAi: false, zalecenia: [], podsumowanie: "Za mało danych telemetrycznych." }));
    expect(tekst).toContain("za mało danych");
    expect(tekst).toContain("Za mało danych telemetrycznych.");
    expect(html).not.toContain('role="slider"');
  });
});
