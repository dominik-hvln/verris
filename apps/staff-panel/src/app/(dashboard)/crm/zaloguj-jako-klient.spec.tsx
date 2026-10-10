import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn() };
});
jest.mock("./search-form", () => ({ CrmSearchForm: () => null }));

import { staffApi } from "@/lib/staff-api";
import { mozeWejscNaKonto } from "@/lib/staff-access";
import StaffCrmPage from "./page";

/** Pozycja 21 — „Zaloguj jako klient” widać tylko z uprawnieniem, którego wymaga API. */
const api = staffApi as jest.Mock;
const KLIENT = { id: "u1", email: "jan@firma.pl", firstName: "Jan", lastName: null, role: "USER", companyName: null, createdAt: "2026-10-01" };
const zDostepem = (dostep: unknown) =>
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === "/staff/me/access") {
      if (dostep instanceof Error) throw dostep;
      return dostep;
    }
    return { rows: [KLIENT] };
  });
const strona = async () => renderToStaticMarkup(await StaffCrmPage({ searchParams: Promise.resolve({}) }));

describe("przycisk „Zaloguj jako klient” w obsłudze", () => {
  beforeEach(() => api.mockReset());

  it("L1 (bez CUSTOMERS_IMPERSONATE) — lista klientów bez przycisku", async () => {
    zDostepem({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "TICKETS_VIEW"] });
    const html = await strona();
    expect(html).toContain("jan@firma.pl");
    expect(html).not.toContain("Zaloguj jako klient");
  });

  it("L2 (CUSTOMERS_VIEW + CUSTOMERS_IMPERSONATE) — przycisk jest", async () => {
    zDostepem({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "CUSTOMERS_IMPERSONATE"] });
    expect(await strona()).toContain("Zaloguj jako klient");
  });

  it("błąd odczytu uprawnień — przycisk ukryty (fail-closed)", async () => {
    zDostepem(new Error("ECONNRESET"));
    expect(await strona()).not.toContain("Zaloguj jako klient");
  });

  it("reguła: oba uprawnienia jak w API; admin zawsze", () => {
    expect(mozeWejscNaKonto({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_IMPERSONATE"] })).toBe(false);
    expect(mozeWejscNaKonto({ role: "ADMIN", isAdmin: true, permissions: [] })).toBe(true);
  });
});
