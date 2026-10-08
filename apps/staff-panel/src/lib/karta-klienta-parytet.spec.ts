import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * PB-46 — układ karty klienta (zakładki i karty) jest opisany w jednym pliku, skopiowanym 1:1 do panelu admina
 * (aplikacje nie importują od siebie). Rozjazd kopii = karty znów się rozjadą — test czerwieni się od razu.
 */
it("sekcje-karty-klienta.ts w panelu obsługi i admina są identyczne", () => {
  const obsluga = readFileSync(resolve(__dirname, "sekcje-karty-klienta.ts"), "utf8");
  const admin = readFileSync(resolve(__dirname, "../../../admin-panel/src/lib/sekcje-karty-klienta.ts"), "utf8");
  expect(admin).toBe(obsluga);
});
