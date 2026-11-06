import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import nextConfig from "../../../../../next.config";

/**
 * Decyzja 06.11 — przewodnik testera (PDF) tylko po zalogowaniu: plik poza public/, trasa sprawdza sesję w API,
 * a next.config dołącza plik do .next/standalone (obraz Dockera kopiuje tylko standalone, static i public).
 */
const mockSesja = jest.fn();
jest.mock("@/lib/session-profile", () => ({
  fetchSessionProfileState: (...a: unknown[]) => mockSesja(...a),
}));

import { GET } from "./route";

const TRASA = "/dashboard/beta/przewodnik";
const PLIK = "assets/beta/Verris-przewodnik-testera.pdf";
const KATALOG_PANELU = path.resolve(__dirname, "../../../../..");

const wywolaj = (cookie?: string) =>
  GET(new NextRequest(`https://panel.verris.pl${TRASA}`, cookie ? { headers: { cookie } } : undefined));

describe(`GET ${TRASA}`, () => {
  beforeEach(() => mockSesja.mockReset());

  it("bez ciasteczka sesji → 401, bez pytania API i bez pliku", async () => {
    const r = await wywolaj();
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).not.toBe("application/pdf");
    expect(mockSesja).not.toHaveBeenCalled();
  });

  it("sesja odrzucona przez API → 401", async () => {
    mockSesja.mockResolvedValue({ profile: null, unauthorized: true });
    const r = await wywolaj("auth_token=stary");
    expect(r.status).toBe(401);
    expect(mockSesja).toHaveBeenCalledWith("stary", null);
  });

  it("API chwilowo niedostępne → 503, nie PDF", async () => {
    mockSesja.mockResolvedValue({ profile: null, unauthorized: false });
    const r = await wywolaj("auth_token=tok");
    expect(r.status).toBe(503);
  });

  it("z sesją → PDF jako załącznik, prywatny cache", async () => {
    mockSesja.mockResolvedValue({ profile: { isSubaccount: false }, unauthorized: false });
    const r = await wywolaj("auth_token=tok");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="Verris-przewodnik-testera.pdf"');
    expect(r.headers.get("cache-control")).toBe("private");
    const tresc = Buffer.from(await r.arrayBuffer());
    expect(tresc.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(tresc.equals(readFileSync(path.join(KATALOG_PANELU, PLIK)))).toBe(true);
  });
});

describe("przewodnik w obrazie panelu", () => {
  it("plik leży poza public/ (nie do pobrania bez logowania)", () => {
    expect(existsSync(path.join(KATALOG_PANELU, PLIK))).toBe(true);
    expect(existsSync(path.join(KATALOG_PANELU, "public", "Verris-przewodnik-testera.pdf"))).toBe(false);
  });

  it("outputFileTracingIncludes: klucz = dokładna ścieżka tej trasy (Next dopasowuje klucze do ścieżki trasy), wartość = ten plik", () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {};
    const pliki = (includes[TRASA] ?? []).map((g) => path.normalize(g));
    expect(pliki).toContain(path.normalize(`./${PLIK}`));
    expect(nextConfig.output).toBe("standalone");
  });
});
