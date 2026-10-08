import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PB-42 — panel staff nie ma środowiska DOM w testach (jest-environment-jsdom jest tylko w admin-panel),
 * więc interakcję karty „Konto klienta” sprawdza admin-panel/…/subscriptions/[id]/konto-klienta-panel.spec.tsx.
 * Ten test pilnuje, że oba panele mają ten sam plik zakładek i widoku — inaczej tamten test nie mówiłby
 * nic o panelu staff.
 */
const STAFF = __dirname;
const ADMIN = join(__dirname, "../../../../../../../../admin-panel/src/app/(dashboard)/subscriptions/[id]");

describe("PB-42 konto klienta — staff i admin mają ten sam panel", () => {
  it.each(["konto-klienta-panel.tsx", "konto-klienta-widok.tsx"])("%s", (plik) => {
    expect(readFileSync(join(STAFF, plik), "utf8")).toBe(readFileSync(join(ADMIN, plik), "utf8"));
  });
});
