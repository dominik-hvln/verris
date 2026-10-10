import { renderToStaticMarkup } from "react-dom/server";

/** F2.3 (D2, 10.10) — decyzja w kolejce nadużyć: zawieś dopasowaną usługę albo tylko powiadom. */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
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

import { staffApi } from "@/lib/staff-api";
import { DecisionForm } from "./[id]/decision-form";
import { decyzjaAction } from "./actions";
import AbuseDetail from "./[id]/page";

const api = staffApi as jest.Mock;
const RAPORT = {
  id: "r1", status: "NEW", category: "PHISHING", url: "https://sklep.pl/x", host: "sklep.pl", description: "Phishing",
  reporterName: null, reporterEmail: "z@example.com", goodFaith: true, ip: null, subscriptionId: "s1", userId: "u1",
  decision: null, decidedAt: null, customerNotifiedAt: null, createdAt: "2026-10-10T10:00:00Z", klient: { id: "u1", email: "k@sklep.pl" },
};

describe("F2.3 — zawieszenie z decyzji abuse", () => {
  beforeEach(() => api.mockReset());

  it("formularz: działająca usługa i uprawnienie → opcja „zawieś usługę sklep.pl”", () => {
    const html = renderToStaticMarkup(<DecisionForm id="r1" maKlienta usluga={{ domena: "sklep.pl", status: "ACTIVE" }} mozeZawiesic />);
    expect(html).toContain('data-zawies="opcja"');
    expect(html).toContain("zawieś usługę sklep.pl");
  });

  it("formularz: bez uprawnienia — podpowiedź o wniosku z karty usługi; zawieszona — informacja, bez opcji", () => {
    const bez = renderToStaticMarkup(<DecisionForm id="r1" maKlienta usluga={{ domena: "sklep.pl", status: "ACTIVE" }} mozeZawiesic={false} />);
    expect(bez).not.toContain('data-zawies="opcja"');
    expect(bez).toContain("SUBSCRIPTIONS_SUSPEND");
    const zaw = renderToStaticMarkup(<DecisionForm id="r1" maKlienta usluga={{ domena: "sklep.pl", status: "SUSPENDED" }} mozeZawiesic />);
    expect(zaw).not.toContain('data-zawies="opcja"');
    expect(zaw).toContain("jest już zawieszona");
    const brak = renderToStaticMarkup(<DecisionForm id="r1" maKlienta />);
    expect(brak).not.toContain("data-zawies");
  });

  it("akcja: suspendService idzie do API tylko, gdy zaznaczone", async () => {
    api.mockResolvedValue({});
    await decyzjaAction({ id: "r1", status: "ACTION_TAKEN", decision: "x".repeat(25), suspendService: true });
    await decyzjaAction({ id: "r1", status: "ACTION_TAKEN", decision: "x".repeat(25) });
    expect(api.mock.calls[0][1].body).toMatchObject({ suspendService: true });
    expect(api.mock.calls[1][1].body).not.toHaveProperty("suspendService");
  });

  it("strona: opcja zawieszenia według /staff/me/access (fail-closed przy błędzie)", async () => {
    const trasy = (dostep: unknown) =>
      api.mockImplementation(async (p: string) => {
        if (p === "/staff/abuse/r1") return { ...RAPORT, usluga: { domena: "sklep.pl", status: "ACTIVE" } };
        if (p === "/staff/me/access") {
          if (dostep instanceof Error) throw dostep;
          return dostep;
        }
        throw new Error(`nieoczekiwane ${p}`);
      });
    trasy({ isAdmin: false, permissions: ["ABUSE_MANAGE", "SUBSCRIPTIONS_SUSPEND"] });
    expect(renderToStaticMarkup(await AbuseDetail({ params: Promise.resolve({ id: "r1" }) }))).toContain('data-zawies="opcja"');
    trasy({ isAdmin: false, permissions: ["ABUSE_MANAGE"] });
    expect(renderToStaticMarkup(await AbuseDetail({ params: Promise.resolve({ id: "r1" }) }))).toContain('data-zawies="brak-uprawnien"');
    trasy(new Error("503"));
    expect(renderToStaticMarkup(await AbuseDetail({ params: Promise.resolve({ id: "r1" }) }))).not.toContain('data-zawies="opcja"');
  });

  /** F3.1 (D4) — „zablokuj wysyłkę” obok zawieszenia: z MAIL_SEND_BLOCK, w API jako blockSending. */
  it("F3.1: opcja blokady wysyłki tylko z MAIL_SEND_BLOCK; blockSending idzie do API tylko, gdy zaznaczone", async () => {
    const z = renderToStaticMarkup(<DecisionForm id="r1" maKlienta usluga={{ domena: "sklep.pl", status: "ACTIVE" }} mozeBlokowac />);
    expect(z).toContain('data-blokada="opcja"');
    expect(z).toContain("zablokuj wysyłkę poczty usługi sklep.pl");
    const bez = renderToStaticMarkup(<DecisionForm id="r1" maKlienta usluga={{ domena: "sklep.pl", status: "ACTIVE" }} />);
    expect(bez).toContain('data-blokada="brak-uprawnien"');
    expect(bez).toContain("MAIL_SEND_BLOCK");
    api.mockResolvedValue({});
    await decyzjaAction({ id: "r1", status: "ACTION_TAKEN", decision: "x".repeat(25), blockSending: true });
    await decyzjaAction({ id: "r1", status: "ACTION_TAKEN", decision: "x".repeat(25) });
    expect(api.mock.calls[0][1].body).toMatchObject({ blockSending: true });
    expect(api.mock.calls[1][1].body).not.toHaveProperty("blockSending");
  });

  it("F3.1: strona — opcja blokady według /staff/me/access", async () => {
    api.mockImplementation(async (p: string) => {
      if (p === "/staff/abuse/r1") return { ...RAPORT, usluga: { domena: "sklep.pl", status: "ACTIVE" } };
      if (p === "/staff/me/access") return { isAdmin: false, permissions: ["ABUSE_MANAGE", "MAIL_SEND_BLOCK"] };
      throw new Error(`nieoczekiwane ${p}`);
    });
    const html = renderToStaticMarkup(await AbuseDetail({ params: Promise.resolve({ id: "r1" }) }));
    expect(html).toContain('data-blokada="opcja"');
    expect(html).toContain('data-zawies="brak-uprawnien"');
  });
});
