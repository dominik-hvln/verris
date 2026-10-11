import { existsSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Weryfikacja 11.10 — nieistniejący adres w panelu klienta (np. /dashboard/services/<id>/files) pokazywał domyślną
 * czarną stronę Next.js po angielsku. app/not-found.tsx obsługuje każdy nieznany adres i każde notFound().
 */
describe("strona 404 panelu klienta", () => {
  it("app/not-found.tsx istnieje w korzeniu aplikacji (łapie każdy nieznany adres)", () => {
    expect(existsSync(join(__dirname, "not-found.tsx"))).toBe(true);
  });

  it("po polsku, z linkiem do panelu, bez słów infrastruktury i bez angielskiego komunikatu Next.js", async () => {
    const { default: NieMaStrony } = await import("./not-found");
    const html = renderToStaticMarkup(<NieMaStrony />);
    expect(html).toContain("Nie ma takiej strony");
    expect(html).toMatch(/<a [^>]*href="\/dashboard"[^>]*>Przejdź do panelu<\/a>/);
    expect(html).toContain('id="main"');
    expect(html).not.toMatch(/could not be found/i);
    // White label (jak lib/biala-etykieta.spec.ts): bez panelu serwera, oprogramowania, węzłów i portu.
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/DirectAdmin|CustomBuild|\bDA\b|CloudLinux|LiteSpeed|\bLVE\b|węzł|\b2222\b/i);
  });
});
