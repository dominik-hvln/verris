import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), redirect: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public body?: unknown,
    ) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn() };
});

import { staffApi, StaffApiError } from "@/lib/staff-api";
import WnioskiPage from "./page";
import { WynikDecyzji, wynikDecyzji } from "./akcje-wniosku";
import { OperacjeKlienta } from "../crm/[userId]/operacje-klienta";
import { OperacjeZWnioskiem } from "../crm/[userId]/operacje-z-wnioskiem";
import { wykonajOperacjeAction, zlozWniosekAction } from "@/lib/wnioski-actions";

/**
 * PB-48 — panel obsługi: strona „Wnioski” (do decyzji / moje) i operacje na karcie klienta
 * („Wyślij wniosek” przy braku uprawnienia, 403 WYMAGA_WNIOSKU z API przełącza na wniosek).
 */
const api = staffApi as jest.Mock;
const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const wniosek = (z: Record<string, unknown> = {}) => ({
  id: "w1",
  typ: "WALLET_CREDIT",
  etykieta: "Zasilenie portfela klienta",
  opis: "Zasilenie portfela: 25,00 K",
  status: "PENDING",
  uzasadnienie: "Rekompensata za awarię poczty.",
  klient: { id: "k1", email: "klient@example.pl", nazwa: "Jan Klient" },
  wnioskujacy: { id: "l1", nazwa: "Ola Konsultant" },
  decydujacy: null,
  powodDecyzji: null,
  wynik: null,
  utworzono: "2026-10-08T10:00:00Z",
  rozstrzygnieto: null,
  ...z,
});

function trasy(m: Record<string, unknown>) {
  api.mockImplementation(async (sciezka: string) => {
    for (const [klucz, v] of Object.entries(m)) if (sciezka.startsWith(klucz)) return typeof v === "function" ? (v as () => unknown)() : v;
    throw new Error(`nieoczekiwane ${sciezka}`);
  });
}

describe("PB-48 — strona Wnioski", () => {
  beforeEach(() => api.mockReset());

  it("z REQUESTS_APPROVE: zakładka „Do decyzji” z akceptuj / odrzuć i liczbą z odmianą", async () => {
    trasy({
      "/staff/me/access": { isAdmin: false, permissions: ["REQUESTS_APPROVE", "BILLING_MANAGE"] },
      "/admin/wnioski/do-decyzji": [wniosek(), wniosek({ id: "w2" })],
      "/admin/wnioski/moje": [],
    });
    const html = renderToStaticMarkup(await WnioskiPage({ searchParams: Promise.resolve({}) }));
    const t = tekst(html);
    expect(t).toContain("Do decyzji (2)");
    expect(t).toContain("Czeka na Twoją decyzję — 2 wnioski");
    expect(t).toContain("Akceptuj i wykonaj");
    expect(t).toContain("Odrzuć");
    expect(t).toContain("Uzasadnienie: Rekompensata za awarię poczty.");
    expect(html).toContain('href="/crm/k1"');
  });

  it("bez REQUESTS_APPROVE: tylko „Moje”, oczekujący wniosek można wycofać, rozpatrzony pokazuje wynik", async () => {
    trasy({
      "/staff/me/access": { isAdmin: false, permissions: ["CUSTOMERS_VIEW"] },
      "/admin/wnioski/moje": [
        wniosek(),
        wniosek({ id: "w3", status: "REJECTED", decydujacy: { id: "kier", nazwa: "Kierownik" }, powodDecyzji: "Klient płaci." }),
        wniosek({ id: "w4", status: "FAILED", wynik: { blad: "Anulować można tylko dokument nieopłacony." } }),
      ],
    });
    const html = renderToStaticMarkup(await WnioskiPage({ searchParams: Promise.resolve({}) }));
    const t = tekst(html);
    expect(t).not.toContain("Do decyzji");
    expect(api).not.toHaveBeenCalledWith("/admin/wnioski/do-decyzji");
    expect(t).toContain("Twoje wnioski — 3 wnioski");
    expect((t.match(/Wycofaj/g) ?? []).length).toBe(1);
    expect(t).toContain("powód: Klient płaci.");
    expect(t).toContain("Nie wykonano: Anulować można tylko dokument nieopłacony.");
  });

  it("awaria API → komunikat zamiast pustej strony", async () => {
    trasy({
      "/staff/me/access": { isAdmin: false, permissions: [] },
      "/admin/wnioski/moje": () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const t = tekst(renderToStaticMarkup(await WnioskiPage({ searchParams: Promise.resolve({ zakladka: "moje" }) })));
    expect(t).toContain("Nie udało się pobrać wniosków");
  });
});

describe("PB-48 — operacje na karcie klienta", () => {
  beforeEach(() => api.mockReset());

  it("bez uprawnień: każda operacja w trybie wniosku („Wyślij wniosek”), bez przycisku wykonania", () => {
    const html = renderToStaticMarkup(
      <OperacjeKlienta userId="k1" isInternal={false} mozeFlage={false} mozeFinanse={false} faktury={[{ id: "f1", number: "VDR/1", amount: "45.00", currency: "PLN" }]} />,
    );
    expect(html.match(/data-tryb="wniosek"/g)).toHaveLength(3);
    expect(html).not.toContain("Zasil portfel");
    expect(html).not.toContain("Oznacz jako wewnętrzne");
    expect((tekst(html).match(/Wyślij wniosek/g) ?? []).length).toBe(3);
  });

  it("z uprawnieniami: wykonanie bezpośrednie; brak dokumentów do anulowania — bez tej operacji", () => {
    const html = renderToStaticMarkup(<OperacjeKlienta userId="k1" isInternal mozeFlage mozeFinanse faktury={[]} />);
    expect(html).not.toContain('data-tryb="wniosek"');
    expect(tekst(html)).toContain("Zdejmij oznaczenie");
    expect(tekst(html)).toContain("Zasil portfel");
    expect(html).not.toContain('data-operacja="INVOICE_VOID"');
  });

  it("karta: uprawnienia z /staff/me/access, stan konta z operational-detail; tylko nieopłacone dokumenty", async () => {
    trasy({ "/staff/me/access": { isAdmin: false, permissions: ["BILLING_MANAGE"] }, "/admin/users/k1/operational-detail": { isInternal: false } });
    const html = renderToStaticMarkup(
      await OperacjeZWnioskiem({
        userId: "k1",
        faktury: [
          { id: "f1", number: "VDR/1", status: "OPEN", amount: "45.00", currency: "PLN" },
          { id: "f2", number: "VDR/2", status: "PAID", amount: "45.00", currency: "PLN" },
        ],
      }),
    );
    expect(html).toMatch(/data-operacja="CUSTOMER_INTERNAL_FLAG" data-tryb="wniosek"/);
    expect(html).toMatch(/data-operacja="WALLET_CREDIT" data-tryb="bezposrednio"/);
    expect(html).toContain("VDR/1");
    expect(html).not.toContain("VDR/2");
  });

  it("karta: flaga „konto wewnętrzne” bezpośrednio tylko z kompletem CUSTOMERS_MANAGE + CUSTOMERS_INTERNAL_FLAG (jak API)", async () => {
    const tryb = async (permissions: string[]) => {
      trasy({ "/staff/me/access": { isAdmin: false, permissions }, "/admin/users/k1/operational-detail": { isInternal: false } });
      const html = renderToStaticMarkup(await OperacjeZWnioskiem({ userId: "k1", faktury: [] }));
      return /data-operacja="CUSTOMER_INTERNAL_FLAG" data-tryb="(\w+)"/.exec(html)?.[1];
    };
    expect(await tryb(["CUSTOMERS_VIEW", "CUSTOMERS_INTERNAL_FLAG"])).toBe("wniosek");
    expect(await tryb(["CUSTOMERS_MANAGE", "CUSTOMERS_INTERNAL_FLAG"])).toBe("bezposrednio");
  });

  it("odczyt stanu konta zawiódł → komunikat, reszta operacji zostaje", async () => {
    trasy({ "/staff/me/access": { isAdmin: false, permissions: [] }, "/admin/users/k1/operational-detail": () => { throw new Error("503"); } });
    const html = renderToStaticMarkup(await OperacjeZWnioskiem({ userId: "k1", faktury: [] }));
    expect(tekst(html)).toContain("Nie udało się odczytać, czy konto jest wewnętrzne");
    expect(html).toContain('data-operacja="WALLET_CREDIT"');
  });

  it("akcja serwerowa: 403 WYMAGA_WNIOSKU → wymagaWniosku; wniosek idzie do admin/wnioski z parametrami", async () => {
    api.mockRejectedValueOnce(new (StaffApiError as unknown as new (m: string, s: number, b: unknown) => Error)("Brak uprawnień.", 403, { code: "WYMAGA_WNIOSKU", operacja: "WALLET_CREDIT" }));
    expect(await wykonajOperacjeAction("WALLET_CREDIT", "k1", { amount: 10 })).toEqual({ ok: false, wymagaWniosku: true, error: "Brak uprawnień." });
    api.mockRejectedValueOnce(new (StaffApiError as unknown as new (m: string, s: number, b: unknown) => Error)("Brak.", 403, { message: "Brak." }));
    expect(await wykonajOperacjeAction("WALLET_CREDIT", "k1", { amount: 10 })).toMatchObject({ ok: false, wymagaWniosku: false });

    api.mockResolvedValueOnce({ id: "w1" });
    expect(await zlozWniosekAction({ typ: "CUSTOMER_INTERNAL_FLAG", userId: "k1", payload: { isInternal: true }, uzasadnienie: " Konto testowe zespołu. " })).toEqual({ ok: true });
    expect(api).toHaveBeenLastCalledWith("/admin/wnioski", {
      method: "POST",
      body: { typ: "CUSTOMER_INTERNAL_FLAG", userId: "k1", payload: { isInternal: true }, uzasadnienie: "Konto testowe zespołu." },
    });
    expect(await zlozWniosekAction({ typ: "WALLET_CREDIT", userId: "k1", payload: {}, uzasadnienie: "x" })).toMatchObject({ ok: false });
  });
});

describe("PB-48 — komunikat po decyzji", () => {
  it("FAILED (operacja nie przeszła) — kolor błędu, nie sukcesu; zaakceptowany — zielony", () => {
    const blad = renderToStaticMarkup(<WynikDecyzji wynik={wynikDecyzji({ status: "FAILED", wynik: { blad: "Dokument już opłacony." } })} />);
    expect(blad).toContain("text-rose-300");
    expect(blad).not.toContain("text-emerald-300");
    expect(blad).toContain("Nie wykonano: Dokument już opłacony.");
    const ok = renderToStaticMarkup(<WynikDecyzji wynik={wynikDecyzji({ status: "APPROVED", wynik: { komunikat: "Portfel zasilony." } })} />);
    expect(ok).toContain("text-emerald-300");
    expect(ok).toContain("Portfel zasilony.");
  });
});
