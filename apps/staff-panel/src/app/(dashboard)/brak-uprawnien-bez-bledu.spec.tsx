import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn() };
});
jest.mock("./referral-enrollments/review-actions", () => ({ ReferralReviewActions: () => null }));

import { staffApi, StaffApiError } from "@/lib/staff-api";
import ReferralEnrollmentsPage from "./referral-enrollments/page";
import StaffMailSettingsPage from "./settings/mail/page";

/**
 * 2026-09-25 na produkcji: rola obsługi bez uprawnienia dostawała 403 z API, a strona — „This page couldn’t load”.
 * Teraz brak uprawnienia i awaria API to komunikat na stronie, reszta strony się renderuje.
 */
const api = staffApi as jest.Mock;
const odmowa = () => new (StaffApiError as unknown as new (m: string, s: number) => Error)("Forbidden", 403);

describe("strony obsługi przy odmowie API", () => {
  beforeEach(() => api.mockReset());

  it("program partnerski: 403 → komunikat o PROMO_MANAGE, nagłówek strony zostaje", async () => {
    api.mockRejectedValue(odmowa());
    const html = renderToStaticMarkup(await ReferralEnrollmentsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Program partnerski");
    expect(html).toContain("PROMO_MANAGE");
  });

  it("program partnerski: awaria API → komunikat, bez wyjątku", async () => {
    api.mockRejectedValue(new Error("ECONNREFUSED"));
    const html = renderToStaticMarkup(await ReferralEnrollmentsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Nie udało się pobrać zgłoszeń");
  });

  it("poczta @verris.pl: 403 → podpowiedź zamiast błędu serwera", async () => {
    api.mockRejectedValue(odmowa());
    const html = renderToStaticMarkup(await StaffMailSettingsPage());
    expect(html).toContain("Poczta @verris.pl");
    expect(html).toContain("nie ma dostępu do ustawień poczty");
  });
});
