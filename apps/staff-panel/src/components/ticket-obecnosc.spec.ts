jest.mock("@/lib/ticket-actions", () => ({ staffPresence: jest.fn(), staffLeave: jest.fn() }));

import { tekstObecnosci } from "./ticket-obecnosc";

/** F3.7 — kolizje w zgłoszeniu: kto ogląda, kto pisze (ostrzeżenie przed podwójną odpowiedzią). */
it("nikt — brak komunikatu; ogląda — informacja; pisze — ostrzeżenie z prośbą o uzgodnienie", () => {
  expect(tekstObecnosci([])).toBeNull();
  expect(tekstObecnosci([{ nazwa: "Anna N.", pisze: false }])).toBe("Anna N. też to ogląda.");
  expect(tekstObecnosci([{ nazwa: "Anna N.", pisze: false }, { nazwa: "Piotr", pisze: false }])).toBe("Anna N., Piotr też to oglądają.");
  expect(tekstObecnosci([{ nazwa: "Anna N.", pisze: false }, { nazwa: "Piotr", pisze: true }])).toBe("Piotr pisze teraz odpowiedź — uzgodnij, kto odpisuje.");
});
