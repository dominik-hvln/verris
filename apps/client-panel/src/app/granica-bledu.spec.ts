/**
 * D3 02.10 — formularz logowania otwarty przed wdrożeniem pokazywał surowe
 * „Server Action "…" was not found on the server”. Strony poza /dashboard nie miały granicy błędu,
 * więc hook przeładowania po deployu (useOdswiezPoWdrozeniu) ich nie obejmował.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { czyNieaktualnaWersja } from "../../../../libs/ui/src/lib/po-wdrozeniu";

const APPS = join(__dirname, "../../..");

describe("granica błędu w korzeniu każdego panelu", () => {
  it.each(["client-panel", "admin-panel", "staff-panel"])(
    "%s: app/error.tsx z przeładowaniem po wdrożeniu",
    (panel) => {
      const plik = join(APPS, panel, "src/app/error.tsx");
      expect(existsSync(plik)).toBe(true);
      expect(readFileSync(plik, "utf8")).toContain(
        "useOdswiezPoWdrozeniu(error)",
      );
    },
  );

  it("komunikat z logowania rozpoznany jako nieaktualna wersja", () => {
    const e = new Error(
      'Server Action "40748e002da221dc2d83c2d9b919defc45f154e78f" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );
    expect(czyNieaktualnaWersja(e)).toBe(true);
  });
});
