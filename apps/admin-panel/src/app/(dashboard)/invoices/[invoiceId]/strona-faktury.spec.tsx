import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Plan E, patch 10 — strona faktury: PDF, korekta, anulowanie (z listy faktur) i ponowienie KSeF (wcześniej
 * tylko w „Danych firmy”), stan KSeF, płatności, linki do klienta i usługi.
 */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/",
}));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import { AKCJE_FAKTURY } from "@/lib/akcje/faktura";
import FakturaPage, { type FakturaSzczegoly } from "./page";

const api = adminApi as jest.Mock;
const ADMIN = { role: "ADMIN", isAdmin: true, permissions: [] };

const faktura = (o: Partial<FakturaSzczegoly> = {}): FakturaSzczegoly => ({
  id: "f1",
  number: "VFV/2026/10/0001",
  status: "PAID",
  amount: "55.35",
  currency: "PLN",
  hostedUrl: null,
  pdfUrl: null,
  provider: null,
  providerRef: null,
  subscriptionId: "s1",
  issuedAt: "2026-10-01T10:00:00Z",
  dueAt: null,
  paidAt: "2026-10-01T10:00:00Z",
  createdAt: "2026-10-01T10:00:00Z",
  user: { id: "u1", email: "jan@firma.pl", name: "Jan", companyName: null },
  subscription: { id: "s1", planName: "Hosting", planSlug: "hosting", domain: "firma.pl" },
  hasVerrisPdf: true,
  kind: "VAT",
  korygowana: null,
  ksef: { status: "REJECTED", numer: null, blad: "Niepoprawny NIP nabywcy", wyslano: "2026-10-01T10:05:00Z", przyjeto: null, terminDo: null },
  platnosci: [{ id: "w1", type: "CHARGE_SUBSCRIPTION", status: "COMPLETED", amount: "-55.35", paymentProvider: null, description: "Abonament", createdAt: "2026-10-01T10:00:00Z" }],
  ...o,
});

async function render(f: FakturaSzczegoly, dostep: unknown = ADMIN) {
  api.mockImplementation(async (p: string) => {
    if (p === `/admin/invoices/${f.id}`) return f;
    if (p === "/staff/me/access") return dostep;
    if (p === `/admin/invoices/${f.id}/korekty`) return [];
    throw new Error(`nieoczekiwane ${p}`);
  });
  return renderToStaticMarkup(await FakturaPage({ params: Promise.resolve({ invoiceId: f.id }) }));
}

beforeEach(() => api.mockReset());

describe("strona faktury", () => {
  it("opłacona, odrzucona przez KSeF (admin): PDF, korekta, ponowienie KSeF, płatność, klient i usługa", async () => {
    const html = await render(faktura());
    expect(html).toContain('href="/api/invoices-pdf/f1"');
    expect(html).toContain('href="/invoices/f1/korekta"');
    expect(html).toContain("Ponów wysyłkę do KSeF");
    expect(html).toContain("Niepoprawny NIP nabywcy");
    expect(html).toContain('href="/customers/u1"');
    expect(html).toContain('href="/subscriptions/s1"');
    expect(html).toContain('href="/customers/u1?sekcja=rozliczenia#portfel"');
    expect(html).toContain("Abonament");
    expect(html).not.toContain('id="anuluj"');
  });

  it("nieopłacona, operator bez BILLING_MANAGE: anulowanie przez wniosek; KSeF tylko dla admina", async () => {
    const html = await render(faktura({ status: "OPEN", paidAt: null }), { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW", "CUSTOMERS_VIEW"] });
    expect(html).toContain('id="anuluj"');
    expect(html).toContain('data-wniosek="INVOICE_VOID"');
    expect(html).not.toContain('href="/invoices/f1/korekta"');
    expect(html).toContain('title="Wymaga roli administratora"');
  });

  it("nieopłacona, z BILLING_MANAGE: przycisk anulowania bez wniosku", async () => {
    const html = await render(faktura({ status: "OPEN", paidAt: null }), { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW", "BILLING_MANAGE"] });
    expect(html).toContain("Anuluj dokument");
    expect(html).not.toContain("data-wniosek");
  });

  it("korekta: link do faktury korygowanej, bez „Wystaw korektę”", async () => {
    const html = await render(faktura({ id: "k1", number: "VFK/2026/10/0001", kind: "KOREKTA", korygowana: { id: "f1", number: "VFV/2026/10/0001" } }));
    expect(html).toContain('href="/invoices/f1"');
    expect(html).not.toContain("/korekta");
  });

  it("każda kotwica z rejestru działań faktury istnieje na stronie", () => {
    const strona = readFileSync(join(__dirname, "page.tsx"), "utf8");
    for (const a of AKCJE_FAKTURY) {
      const href = a.href({ id: "f1", klientId: "u1" });
      if (href.startsWith("/invoices/f1#")) expect(strona).toContain(`id="${href.split("#")[1]}"`);
    }
  });

  it("fala 1B: przyjęta przez KSeF — „Pobierz UPO” (admin); odrzucona — bez UPO", async () => {
    const przyjeta = await render(faktura({ ksef: { status: "ACCEPTED", numer: "KSEF-1", blad: null, wyslano: null, przyjeto: "2026-10-01T10:06:00Z", terminDo: null } }));
    expect(przyjeta).toContain('href="/api/invoices-upo/f1"');
    expect(await render(faktura())).not.toContain("/api/invoices-upo/");
    const bezAdmina = await render(faktura({ ksef: { status: "ACCEPTED", numer: "KSEF-1", blad: null, wyslano: null, przyjeto: null, terminDo: null } }), { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW"] });
    expect(bezAdmina).not.toContain('href="/api/invoices-upo/f1"');
    expect(bezAdmina).toMatch(/title="Wymaga roli administratora"[^>]*>Pobierz UPO/);
  });

  it("fala 1B: „Dokończ wystawienie” tylko dla opłaconej faktury bez PDF-u", async () => {
    expect(await render(faktura({ hasVerrisPdf: false }))).toContain("Dokończ wystawienie</button>");
    expect(await render(faktura())).not.toContain('id="dokoncz"');
    expect(await render(faktura({ status: "OPEN", paidAt: null, hasVerrisPdf: false }))).not.toContain('id="dokoncz"');
    const bezPrawa = await render(faktura({ hasVerrisPdf: false }), { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW"] });
    expect(bezPrawa).toMatch(/title="Wymaga BILLING_MANAGE"[^>]*>Dokończ wystawienie/);
  });

  // Przegląd 10.10: strona wymaga BILLING_VIEW; księgowa bez CUSTOMERS_VIEW dostawała linki do kart, które kończą się odmową.
  it("operator z samym BILLING_VIEW: klient i usługa jako tekst, bez linków do kart spoza roli", async () => {
    const html = await render(faktura(), { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW"] });
    expect(html).toContain("jan@firma.pl");
    expect(html).not.toContain('href="/customers/u1');
    expect(html).not.toContain('href="/subscriptions/s1"');
    const zUslugami = await render(faktura(), { role: "STAFF", isAdmin: false, permissions: ["BILLING_VIEW", "SUBSCRIPTIONS_MANAGE"] });
    expect(zUslugami).toContain('href="/subscriptions/s1"');
  });
});
