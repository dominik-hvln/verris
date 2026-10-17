import { bootstrapZakonczony, wezelPoSygnale } from "./node-live-status";

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


describe("wezelPoSygnale (17.10)", () => {
  const w = { server: { status: "PENDING_APPROVAL", id: "s1" } };
  it("akceptacja widoczna na żywo → status ACTIVE (krok profilu nie jest blokowany)", () => {
    expect(wezelPoSygnale(w, { active: true })?.server.status).toBe("ACTIVE");
  });
  it("bez zmian → ten sam obiekt (bez zbędnego renderu)", () => {
    expect(wezelPoSygnale(w, { active: false })).toBe(w);
  });
});
