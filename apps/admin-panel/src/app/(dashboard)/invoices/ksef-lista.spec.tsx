import { renderToStaticMarkup } from "react-dom/server";

/** F3.6 — kolumna „KSeF” na liście faktur i filtr po stanie KSeF (odczyt istniejących pól, GET /admin/invoices?ksef=). */
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/invoices" }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));

import { adminApi } from "@/lib/api";
import Faktury from "./page";

const api = adminApi as jest.Mock;
const wiersz = (id: string, ksefStatus: string, ksefNumber: string | null = null) => ({
  id,
  number: `VFV/2026/10/${id}`,
  status: "PAID",
  amount: "45.00",
  currency: "PLN",
  hostedUrl: null,
  pdfUrl: null,
  provider: null,
  providerRef: null,
  subscriptionId: null,
  issuedAt: "2026-10-01T10:00:00Z",
  dueAt: null,
  paidAt: null,
  createdAt: "2026-10-01T10:00:00Z",
  user: { id: "u1", email: "a@test.pl", name: null, companyName: null },
  subscription: null,
  hasVerrisPdf: true,
  ksefStatus,
  ksefNumber,
});

beforeEach(() => {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW"] };
    if (s.startsWith("/admin/invoices")) return { rows: [wiersz("0001", "ACCEPTED", "5260001234-20261001-ABCDEF-01"), wiersz("0002", "REJECTED")], total: 2, limit: 50, offset: 0 };
    return null;
  });
});

it("lista pokazuje stan KSeF i numer KSeF", async () => {
  const html = renderToStaticMarkup(await Faktury({ searchParams: Promise.resolve({}) }));
  expect(html).toContain(">KSeF</th>");
  expect(html).toContain('data-ksef="ACCEPTED"');
  expect(html).toContain("przyjęta");
  expect(html).toContain("5260001234-20261001-ABCDEF-01");
  expect(html).toContain("odrzucona");
});

it("filtr KSeF idzie do API; nieznana wartość z adresu jest pomijana", async () => {
  renderToStaticMarkup(await Faktury({ searchParams: Promise.resolve({ ksef: "REJECTED" }) }));
  expect(api.mock.calls.map((c) => c[0]).find((s: string) => s.startsWith("/admin/invoices?"))).toContain("ksef=REJECTED");
  api.mockClear();
  for (const ksef of ["'; DROP", "toString"]) {
    api.mockClear();
    renderToStaticMarkup(await Faktury({ searchParams: Promise.resolve({ ksef }) }));
    expect(api.mock.calls.map((c) => c[0]).find((s: string) => s.startsWith("/admin/invoices?"))).not.toContain("ksef=");
  }
});
