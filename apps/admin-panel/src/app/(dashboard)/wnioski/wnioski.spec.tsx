import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), redirect: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public body?: unknown,
    ) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import WnioskiPage from "./page";
import { WynikDecyzji, wynikDecyzji } from "./akcje-wniosku";
import { PoleKontaWewnetrznego } from "../customers/[userId]/konto-wewnetrzne";
import { odrzucWniosekAction, zlozWniosekAction } from "@/lib/wnioski-actions";

/** PB-48 — panel admina: „Wnioski o operacje” (do decyzji, historia) i wniosek z przełącznika „konto wewnętrzne”. */
const api = adminApi as jest.Mock;
const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const wniosek = (z: Record<string, unknown> = {}) => ({
  id: "w1",
  typ: "CUSTOMER_INTERNAL_FLAG",
  etykieta: "Oznaczenie konta jako wewnętrzne",
  opis: "Oznacz konto jako wewnętrzne (poza MRR i churnem)",
  status: "PENDING",
  uzasadnienie: "Konto testowe zespołu.",
  klient: { id: "k1", email: "test@verris.pl", nazwa: null },
  wnioskujacy: { id: "l1", nazwa: "Ola Konsultant" },
  decydujacy: null,
  powodDecyzji: null,
  wynik: null,
  utworzono: "2026-10-08T10:00:00Z",
  rozstrzygnieto: null,
  ...z,
});
const trasy = (m: Record<string, unknown>) =>
  api.mockImplementation(async (s: string) => {
    for (const [k, v] of Object.entries(m)) if (s.startsWith(k)) return v;
    throw new Error(`nieoczekiwane ${s}`);
  });

describe("PB-48 — strona „Wnioski o operacje”", () => {
  beforeEach(() => api.mockReset());

  it("do decyzji: lista z akceptuj / odrzuć, liczba z odmianą, link do karty klienta", async () => {
    trasy({ "/staff/me/access": { isAdmin: true }, "/admin/wnioski/do-decyzji": [wniosek()] });
    const html = renderToStaticMarkup(await WnioskiPage({ searchParams: Promise.resolve({}) }));
    expect(tekst(html)).toContain("Czeka na decyzję — 1 wniosek");
    expect(tekst(html)).toContain("Akceptuj i wykonaj");
    expect(html).toContain('href="/customers/k1"');
    // Administrator nie ma zakładki „Moje”.
    expect(tekst(html)).not.toContain("Moje");
  });

  it("historia z filtrem statusu: wynik, decydujący i powód", async () => {
    trasy({
      "/staff/me/access": { isAdmin: true },
      "/admin/wnioski/historia": [
        wniosek({ status: "REJECTED", decydujacy: { id: "a", nazwa: "Dominik" }, powodDecyzji: "Klient płaci." }),
        wniosek({ id: "w2", status: "APPROVED", wynik: { komunikat: "Konto oznaczone jako wewnętrzne." } }),
      ],
    });
    const t = tekst(renderToStaticMarkup(await WnioskiPage({ searchParams: Promise.resolve({ zakladka: "historia", status: "REJECTED" }) })));
    expect(api).toHaveBeenCalledWith("/admin/wnioski/historia?status=REJECTED");
    expect(t).toContain("Historia — 2 wnioski");
    expect(t).toContain("Decyzja: Dominik");
    expect(t).toContain("powód: Klient płaci.");
    expect(t).toContain("Konto oznaczone jako wewnętrzne.");
    expect(t).not.toContain("Akceptuj i wykonaj");
  });

  it("403 → czytelny komunikat o uprawnieniu, strona zostaje", async () => {
    api.mockImplementation(async (s: string) => {
      if (s === "/staff/me/access") return { isAdmin: false };
      throw new (AdminApiError as unknown as new (m: string, st: number) => Error)("Forbidden", 403);
    });
    const t = tekst(renderToStaticMarkup(await WnioskiPage({ searchParams: Promise.resolve({}) })));
    expect(t).toContain("Wnioski o operacje");
    expect(t).toContain("REQUESTS_APPROVE");
    expect(t).toContain("Moje");
  });

  it("odrzucenie bez powodu nie idzie do API", async () => {
    expect(await odrzucWniosekAction("w1", " ")).toMatchObject({ ok: false });
    expect(api).not.toHaveBeenCalled();
  });
});

describe("PB-48 — wniosek z przełącznika „konto wewnętrzne”", () => {
  beforeEach(() => api.mockReset());

  it("bez uprawnienia przy znanym kliencie: „Wyślij wniosek” zamiast samej podpowiedzi; z uprawnieniem — brak", () => {
    const bez = renderToStaticMarkup(<PoleKontaWewnetrznego userId="k1" checked={false} onChange={() => undefined} dozwolone={false} />);
    expect(tekst(bez)).toContain("Wyślij wniosek");
    expect(bez).toContain('data-wniosek="CUSTOMER_INTERNAL_FLAG"');
    const z = renderToStaticMarkup(<PoleKontaWewnetrznego userId="k1" checked={false} onChange={() => undefined} dozwolone />);
    expect(tekst(z)).not.toContain("Wyślij wniosek");
  });

  it("wniosek prosi o stan przeciwny do obecnego", async () => {
    api.mockResolvedValueOnce({ id: "w1" });
    await zlozWniosekAction({ typ: "CUSTOMER_INTERNAL_FLAG", userId: "k1", payload: { isInternal: true }, uzasadnienie: "Konto testowe zespołu." });
    expect(api).toHaveBeenCalledWith("/admin/wnioski", {
      method: "POST",
      body: { typ: "CUSTOMER_INTERNAL_FLAG", userId: "k1", payload: { isInternal: true }, uzasadnienie: "Konto testowe zespołu." },
    });
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
