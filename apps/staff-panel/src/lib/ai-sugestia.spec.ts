import { odczytajSugestie } from "./ai-sugestia";

describe("odczytajSugestie (N-19)", () => {
  it("klucze z promptu: szkic + checklista, bez reszty", () => {
    expect(odczytajSugestie({ szkic: " Dzień dobry ", checklista: ["Sprawdź DNS", ""] })).toEqual({
      szkic: "Dzień dobry",
      checklista: ["Sprawdź DNS"],
      reszta: null,
    });
  });

  it("angielskie klucze i nieznane pola nie giną", () => {
    const s = odczytajSugestie({ draft: "Hello", steps: ["a", { b: 1 }], confidence: 0.4 });
    expect(s.szkic).toBe("Hello");
    expect(s.checklista).toEqual(["a", '{"b":1}']);
    expect(s.reszta).toContain("confidence");
  });

  it("bez znanego klucza bierze pierwszy dłuższy tekst", () => {
    const tekst = "Dzień dobry, sprawdziliśmy konto i wszystko działa poprawnie.";
    expect(odczytajSugestie({ inne: tekst }).szkic).toBe(tekst);
  });

  it("gołe wartości", () => {
    expect(odczytajSugestie("tekst").szkic).toBe("tekst");
    expect(odczytajSugestie([1, 2]).reszta).toContain("1");
    expect(odczytajSugestie(null)).toEqual({ szkic: null, checklista: [], reszta: null });
  });
});
