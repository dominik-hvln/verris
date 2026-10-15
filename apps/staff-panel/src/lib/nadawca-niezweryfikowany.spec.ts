import { wiadomoscZMaila, zgloszenieZMaila } from "./nadawca-niezweryfikowany";

/** Decyzja 15.10 (#14) — oznaczanie zgłoszeń i wiadomości z maila jako „niezweryfikowany nadawca”. */
describe("niezweryfikowany nadawca", () => {
  it("zgłoszenie: źródło EMAIL albo tag z API", () => {
    expect(zgloszenieZMaila({ zrodlo: "EMAIL" })).toBe(true);
    expect(zgloszenieZMaila({ zrodlo: "PANEL", tags: ["e-mail-niezweryfikowany"] })).toBe(true);
    expect(zgloszenieZMaila({ zrodlo: "PANEL", tags: ["vip"] })).toBe(false);
    expect(zgloszenieZMaila({})).toBe(false);
  });

  it("wiadomość: tylko odpowiedź klienta z maila", () => {
    expect(wiadomoscZMaila({ zrodlo: "EMAIL", isStaff: false })).toBe(true);
    expect(wiadomoscZMaila({ zrodlo: "EMAIL", isStaff: true })).toBe(false);
    expect(wiadomoscZMaila({ zrodlo: null, isStaff: false })).toBe(false);
  });
});
