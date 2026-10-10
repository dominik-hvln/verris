import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({ getAdminAuthToken: jest.fn() }));
import { getAdminAuthToken } from "@/lib/auth";
import { GET } from "./route";

/** Fala 1B — proxy UPO faktury z KSeF: sesja, walidacja id, plik XML bez cache, błąd API przekazany dalej. */
const token = getAdminAuthToken as jest.Mock;
const ID = "8f1c2b3a-4d5e-4f60-9a1b-2c3d4e5f6a7b";
const wywolaj = (id: string) => GET(new NextRequest(`https://admin.verris.pl/api/invoices-upo/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/invoices-upo/[id]", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it("bez sesji → 401; zły id → 400; bez zapytania do API", async () => {
    token.mockResolvedValue(undefined);
    expect((await wywolaj(ID)).status).toBe(401);
    token.mockResolvedValue("t");
    expect((await wywolaj("..%2Fadmin")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("poprawny id → XML jako załącznik, z tokenem Bearer", async () => {
    token.mockResolvedValue("tok");
    fetchMock.mockResolvedValue(new Response("<UPO/>", { status: 200 }));
    const r = await wywolaj(ID);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe(`attachment; filename="UPO-${ID}.xml"`);
    expect(await r.text()).toBe("<UPO/>");
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/admin/ksef/invoices/${ID}/upo$`));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("UPO niedostępne (404 z API) → 404 z komunikatem API", async () => {
    token.mockResolvedValue("tok");
    fetchMock.mockResolvedValue(new Response("UPO dostępne tylko dla faktur przyjętych przez KSeF.", { status: 404 }));
    const r = await wywolaj(ID);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("tylko dla faktur przyjętych");
  });
});
