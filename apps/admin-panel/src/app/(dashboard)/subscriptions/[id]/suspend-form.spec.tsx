import { renderToStaticMarkup } from "react-dom/server";

/** F2.3 (D2, 10.10) — zawieszenie na karcie usługi w panelu operatora: L3 sam (powód, zgłoszenie), L2 wniosek, L1 nic. */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi } from "@/lib/api";
import { powodyZawieszenia, SuspendForm } from "./suspend-form";
import { suspendSubscriptionAction, unsuspendSubscriptionAction } from "./suspend-actions";

const api = adminApi as jest.Mock;
const op = (...permissions: string[]) => ({ isAdmin: false, permissions });
const html = (status: string, dostep: { isAdmin: boolean; permissions: string[] }) =>
  renderToStaticMarkup(<SuspendForm subscriptionId="s1" userId="u1" status={status} domain="firma.pl" dostep={dostep} />);

describe("F2.3 — zawieszenie na karcie usługi", () => {
  it("L3 (SUBSCRIPTIONS_SUSPEND): skutki, powód obowiązkowy, numer zgłoszenia, bez wniosku", () => {
    const h = html("ACTIVE", op("SUBSCRIPTIONS_SUSPEND"));
    expect(h).toContain('data-zawieszenie="skutki"');
    expect(h).toContain("poczta (odbiór i wysyłka)");
    expect(h).toContain("obowiązkowy, min. 10 znaków");
    expect(h).toContain("Numer zgłoszenia klienta");
    expect(h).toContain("Zawieś usługę");
    expect(h).not.toContain("data-wniosek");
  });

  it("L2 (SUBSCRIPTIONS_MANAGE): „Wyślij wniosek” zawieszenia, a przy zawieszonej — odwieszenia", () => {
    expect(html("ACTIVE", op("SUBSCRIPTIONS_MANAGE"))).toContain('data-wniosek="SUBSCRIPTION_SUSPEND"');
    expect(html("SUSPENDED", op("SUBSCRIPTIONS_MANAGE"))).toContain('data-wniosek="SUBSCRIPTION_UNSUSPEND"');
    expect(html("ACTIVE", op("SUBSCRIPTIONS_MANAGE"))).not.toContain(">Zawieś usługę<");
  });

  it("L1 (bez obu): tylko informacja, czego brakuje", () => {
    const h = html("ACTIVE", op("CUSTOMERS_VIEW"));
    expect(h).toContain('data-zawieszenie="brak-uprawnien"');
    expect(h).toContain("Wymaga SUBSCRIPTIONS_SUSPEND");
    expect(h).not.toContain("data-wniosek");
  });

  it("odwieszenie: „Obciąż za odnowienie” tylko z BILLING_MANAGE albo dla administratora", () => {
    expect(html("SUSPENDED", op("SUBSCRIPTIONS_SUSPEND"))).not.toContain("Obciąż klienta");
    expect(html("SUSPENDED", op("SUBSCRIPTIONS_SUSPEND", "BILLING_MANAGE"))).toContain("Obciąż klienta");
    expect(html("SUSPENDED", { isAdmin: true, permissions: [] })).toContain("Obciąż klienta");
  });

  it("powody: pracownik bez „Brak płatności”, administrator z nim", () => {
    expect(powodyZawieszenia(false).map((r) => r.value)).toEqual(["ABUSE", "MANUAL_ADMIN", "CUSTOMER_REQUEST"]);
    expect(powodyZawieszenia(true).map((r) => r.value)).toContain("PAYMENT_FAILED");
  });

  it("akcje wysyłają numer zgłoszenia (puste — bez pola)", async () => {
    api.mockResolvedValue({});
    await suspendSubscriptionAction("s1", "ABUSE", " phishing potwierdzony ", " #ab12cd34 ");
    await unsuspendSubscriptionAction("s1", "klient usunął pliki", false);
    expect(api.mock.calls[0]).toEqual(["/admin/subscriptions/s1/suspend", { method: "POST", body: { reason: "ABUSE", note: "phishing potwierdzony", zgloszenie: "#ab12cd34" } }]);
    expect(api.mock.calls[1][1].body).toEqual({ note: "klient usunął pliki", chargeRenewal: false, zgloszenie: undefined });
  });
});
