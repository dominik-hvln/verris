import { existsSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Weryfikacja 11.10 — nieistniejący adres w panelu operatora (np. /services/<id>) pokazywał domyślną czarną stronę
 * Next.js po angielsku. app/not-found.tsx obsługuje każdy nieznany adres i każde notFound() w panelu.
 */
describe("strona 404 panelu operatora", () => {
  it("app/not-found.tsx istnieje w korzeniu aplikacji (łapie każdy nieznany adres)", () => {
    expect(existsSync(join(__dirname, "not-found.tsx"))).toBe(true);
  });

  it("po polsku, w stylu panelu, z linkiem na pulpit; bez angielskiego komunikatu Next.js", async () => {
    const { default: NieMaStrony } = await import("./not-found");
    const html = renderToStaticMarkup(<NieMaStrony />);
    expect(html).toContain("Nie ma takiej strony");
    expect(html).toContain("Verris Core");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Wróć na pulpit<\/a>/);
    expect(html).not.toMatch(/could not be found/i);
  });
});
