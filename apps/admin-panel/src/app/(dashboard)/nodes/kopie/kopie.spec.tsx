import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), usePathname: () => "/nodes/kopie" }));

import { adminApi } from "@/lib/api";
import ProbyOdtworzeniaPage from "./page";
import { ostatniePerZrodlo, type ProbaOdtworzenia } from "./dane";

/** Fala 1B — Flota → Kopie: próby odtworzenia (GET /admin/live-readiness/proby-odtworzenia). */
const api = adminApi as jest.Mock;
const proba = (o: Partial<ProbaOdtworzenia>): ProbaOdtworzenia => ({
  id: "p1",
  finishedAt: new Date().toISOString(),
  durationSec: 125,
  result: "OK",
  objectName: "verris-2026-10-09-0300.sql.gz",
  source: "s3://kopie/db",
  owner: "Dominik",
  notes: null,
  rowCounts: { User: 120 },
  ...o,
});

describe("próby odtworzenia kopii", () => {
  it("ostatnia próba per źródło — pierwsza z listy (API sortuje od najnowszej)", () => {
    const lista = [proba({ id: "a", source: "x", result: "FAILED" }), proba({ id: "b", source: "y" }), proba({ id: "c", source: "x" })];
    expect(ostatniePerZrodlo(lista).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("strona: wynik, czas, właściciel i nieudana próba z treścią błędu", async () => {
    api.mockResolvedValue([proba({ id: "a", result: "FAILED", notes: "pg_restore: brak tabeli" }), proba({ id: "b", finishedAt: "2026-01-01T00:00:00Z" })]);
    const html = renderToStaticMarkup(await ProbyOdtworzeniaPage());
    expect(html).toContain("nieudana");
    expect(html).toContain("2 min 5 s");
    expect(html).toContain("pg_restore: brak tabeli");
    expect(html).toContain("User: 120");
  });

  it("brak prób: ostrzeżenie zamiast pustej tabeli", async () => {
    api.mockResolvedValue([]);
    expect(renderToStaticMarkup(await ProbyOdtworzeniaPage())).toContain("Nie było jeszcze żadnej próby odtworzenia.");
  });

  it("błąd API: strona błędu, nie pusta lista", async () => {
    api.mockRejectedValue(new Error("403"));
    expect(renderToStaticMarkup(await ProbyOdtworzeniaPage())).not.toContain("Nie było jeszcze");
  });
});
