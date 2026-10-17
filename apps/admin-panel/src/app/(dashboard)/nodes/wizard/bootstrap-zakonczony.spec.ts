import { bootstrapZakonczony } from "./node-live-status";

/** PB-31 (17.10): „Bootstrap doszedł do fazy Gotowe” zaznaczało się już po handshake (faza AGENT), przed CANARY i TLS. */
describe("bootstrapZakonczony", () => {
  it.each(["AGENT", "CANARY", "TLS"])("faza %s po handshake — jeszcze nie gotowe", (faza) => {
    expect(bootstrapZakonczony(faza, true)).toBe(false);
  });
  it("DONE — gotowe", () => {
    expect(bootstrapZakonczony("DONE", true)).toBe(true);
  });
  it("węzeł bez bootstrapu v2 (faza null) — gotowy po handshake", () => {
    expect(bootstrapZakonczony(null, true)).toBe(true);
    expect(bootstrapZakonczony(null, false)).toBe(false);
  });
});
