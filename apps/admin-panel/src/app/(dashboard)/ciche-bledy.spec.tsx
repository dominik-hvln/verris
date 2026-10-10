import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B (audyt OP-11) — błąd API pod listą to „Nie udało się wczytać — Spróbuj ponownie”, nie pusta lista
 * („Brak operacji”, „Brak zarejestrowanych działań”), która wygląda na prawdziwy stan. Reszta strony działa.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn(), adminApiMultipart: jest.fn() };
});

import { adminApi } from "@/lib/api";

const api = adminApi as jest.Mock;
const ADMIN = { role: "ADMIN", isAdmin: true, permissions: [] };

/** Odpowiedzi API wg początku ścieżki; ścieżka z `padaja` — błąd sieci. */
function apiZ(odpowiedzi: Record<string, unknown>, padaja: RegExp) {
  api.mockImplementation(async (sciezka: string) => {
    if (padaja.test(sciezka)) throw new Error("ECONNREFUSED");
    const klucz = Object.keys(odpowiedzi).find((k) => sciezka.startsWith(k));
    if (klucz === undefined) throw new Error(`nieoczekiwane wywołanie ${sciezka}`);
    return odpowiedzi[klucz];
  });
}

async function html(modul: string, props: unknown = {}) {
  const Strona = (await import(modul)).default as (p: unknown) => Promise<React.ReactElement>;
  return renderToStaticMarkup(await Strona(props));
}

beforeEach(() => api.mockReset());

it("Role: bez katalogu uprawnień — komunikat z ponowieniem zamiast pustej listy ról", async () => {
  apiZ({ "/admin/staff-roles": [] }, /catalog/);
  const h = await html("./roles/page");
  expect(h).toContain("Nie udało się wczytać ról i uprawnień.");
  expect(h).toContain("Spróbuj ponownie");
});

it("Kolejka zadań: operacje węzłów padły — komunikat, nie „Brak operacji węzłów w historii”", async () => {
  apiZ({ "/admin/provisioning-queue": { async: true, counts: {}, rows: [] } }, /node-tasks/);
  const h = await html("./provisioning-queue/page", { searchParams: Promise.resolve({}) });
  expect(h).toContain("Nie udało się wczytać operacji węzłów.");
  expect(h).not.toContain("Brak operacji węzłów w historii");
  // Kolejka zakładania (pierwsza lista) wczytała się normalnie.
  expect(h).toContain("Brak zadań w wybranym stanie.");
});

it("Korekta faktury: lista wystawionych korekt padła — komunikat zamiast pominięcia sekcji", async () => {
  const faktura = { id: "f1", number: "FV/1/2026", status: "PAID", amount: "123.00", netAmount: null, vatAmount: null, currency: "PLN", issuedAt: "2026-10-01T00:00:00Z", lineItems: [], buyerSnapshot: null };
  apiZ({ "/admin/invoices/f1": faktura }, /korekty/);
  const h = await html("./invoices/[invoiceId]/korekta/page", { params: Promise.resolve({ invoiceId: "f1" }) });
  expect(h).toContain("Korekta faktury FV/1/2026");
  expect(h).toContain("Nie udało się wczytać wystawionych już korekt.");
});

it("Operatorzy: dziennik aktywności i role padły — komunikaty, nie „Brak zarejestrowanych działań”", async () => {
  apiZ({ "/staff/me/access": ADMIN, "/admin/users": { rows: [], total: 0, page: 1, totalPages: 1 } }, /staff-roles/);
  const h = await html("./operators/page", { searchParams: Promise.resolve({}) });
  expect(h).toContain("Nie udało się wczytać dziennika aktywności.");
  expect(h).toContain("Nie udało się wczytać ról do wyboru.");
  expect(h).not.toContain("Brak zarejestrowanych działań");
});

it("Szablony odpowiedzi: błąd API — komunikat, nie pusta lista szablonów", async () => {
  apiZ({}, /canned/);
  const h = await html("./settings/canned-responses/page");
  expect(h).toContain("Nie udało się wczytać szablonów odpowiedzi.");
});

it("VPS: plany i snapshoty padły — komunikaty; katalog typów to tylko podpowiedź", async () => {
  apiZ({ "/admin/vps/availability": { available: true }, "/admin/vps/server-types": [] }, /vps\/(plans|snapshot)/);
  const h = await html("./vps/page");
  expect(h).toContain("Nie udało się wczytać planów VPS.");
  expect(h).toContain("Nie udało się wczytać ustawień snapshotów.");
});
