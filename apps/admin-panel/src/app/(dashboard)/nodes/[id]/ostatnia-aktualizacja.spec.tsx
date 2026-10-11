import { renderToStaticMarkup } from "react-dom/server";
import { OstatniaAktualizacja } from "./ostatnia-aktualizacja";

/**
 * Weryfikacja 11.10 — karta węzła pokazuje wynik OSTATNIEGO przebiegu aktualizacji (także udanego) z datą,
 * a nie wyjście starszego, nieudanego; starsze przebiegi są w historii zadań.
 */
const tekst = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("OstatniaAktualizacja", () => {
  it("udany przebieg: status, daty, wynik „wymaga restartu” i końcówka wyjścia; link do historii", () => {
    const h = renderToStaticMarkup(
      <OstatniaAktualizacja
        zadaniaHref="/nodes/n1?sekcja=zadania"
        a={{ id: "t3", status: "COMPLETED", zlecono: "2026-10-11T13:56:00Z", zakonczono: "2026-10-11T14:16:00Z", wynik: "needs-reboot", blad: null, wyjscie: "All parts have been installed\nVERRIS_UPDATE_RESULT=needs-reboot" }}
      />,
    );
    expect(tekst(h)).toContain("Ostatni przebieg: zakończona");
    expect(tekst(h)).toMatch(/zlecono 11\.10\.2026.*zakończono 11\.10\.2026/);
    expect(tekst(h)).toContain("Wynik: zaktualizowane — węzeł wymaga restartu");
    expect(h).toContain("VERRIS_UPDATE_RESULT=needs-reboot");
    expect(h).toContain('href="/nodes/n1?sekcja=zadania"');
  });

  it("nieudany przebieg: błąd i wynik z błędami; w toku — bez wyniku", () => {
    const h = renderToStaticMarkup(
      <OstatniaAktualizacja
        zadaniaHref="/z"
        a={{ id: "t2", status: "FAILED", zlecono: "2026-10-11T12:36:00Z", zakonczono: "2026-10-11T12:40:00Z", wynik: "failed", blad: "Another instance of custombuild is holding the lock", wyjscie: "VERRIS_UPDATE_RESULT=failed errors=1" }}
      />,
    );
    expect(tekst(h)).toContain("nieudana");
    expect(tekst(h)).toContain("Wynik: aktualizacja z błędami");
    expect(h).toContain("holding the lock");
    const trwa = renderToStaticMarkup(
      <OstatniaAktualizacja zadaniaHref="/z" a={{ id: "t4", status: "RUNNING", zlecono: "2026-10-11T15:00:00Z", zakonczono: null, wynik: null, blad: null, wyjscie: null }} />,
    );
    expect(tekst(trwa)).toContain("Ostatni przebieg: w toku");
    expect(trwa).not.toContain("Wynik:");
  });

  it("bez przebiegów — informacja zamiast pustej ramki", () => {
    expect(tekst(renderToStaticMarkup(<OstatniaAktualizacja zadaniaHref="/z" a={null} />))).toContain("nie był jeszcze aktualizowany");
  });

  it("udany build z ostrzeżeniami (CageFS /run/mysql): nie „wszystko zaktualizowane”, tylko „z ostrzeżeniami”", () => {
    const h = renderToStaticMarkup(
      <OstatniaAktualizacja
        zadaniaHref="/z"
        a={{ id: "t4", status: "COMPLETED", zlecono: "2026-10-11T13:56:00Z", zakonczono: "2026-10-11T14:14:00Z", wynik: "ok", ostrzezenia: 1, blad: null, wyjscie: "[verris-update] OSTRZEŻENIE: CustomBuild: Error: /etc/cagefs/cagefs.mp …\nVERRIS_UPDATE_RESULT=ok warnings=1" }}
      />,
    );
    expect(tekst(h)).toContain("Wynik: zaktualizowane z ostrzeżeniami (1)");
    expect(tekst(h)).not.toContain("wszystko zaktualizowane");
  });
});
