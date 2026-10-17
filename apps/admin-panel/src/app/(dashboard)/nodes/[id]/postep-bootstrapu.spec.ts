jest.mock("../actions", () => ({}));
import { stanPostepu } from "./node-bootstrap-progress";

/** Przegląd 18.10: błąd DNS w OVH (zdarzenie control-plane) pokazywał bootstrap jako przerwany, choć faza TLS dalej trwa. */
const z = (phase: string, status: string, message: string | null = null) => ({ phase, status, message, createdAt: "2026-10-18T10:00:00Z" });

it("najnowsze zdarzenie DNS/FAILED → bez paska błędu bootstrapu, osobna informacja o DNS", () => {
  const s = stanPostepu({ phase: "TLS", events: [z("DNS", "FAILED", "OVH: Glue ns1"), z("TLS", "STARTED")] });
  expect(s.failed).toBe(false);
  expect(s.dns).toContain("Glue ns1");
});

it("błąd fazy skryptu → pasek błędu", () => {
  expect(stanPostepu({ phase: "TLS", events: [z("TLS", "FAILED", "rekord A"), z("DNS", "OK")] }).failed).toBe(true);
});

it("po DONE bez informacji o DNS", () => {
  expect(stanPostepu({ phase: "DONE", events: [z("DONE", "OK"), z("DNS", "FAILED", "x")] }).dns).toBeNull();
});
