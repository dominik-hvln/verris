import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({ getAdminAuthToken: jest.fn() }));
import { getAdminAuthToken } from "@/lib/auth";
import { GET } from "./route";

/** X-05 — proxy PDF faktury w panelu admina: sesja, walidacja id, przekazanie pliku bez cache. */
const token = getAdminAuthToken as jest.Mock;
const ID = "8f1c2b3a-4d5e-4f60-9a1b-2c3d4e5f6a7b";
const wywolaj = (id: string) => GET(new NextRequest(`https://admin.verris.pl/api/invoices-pdf/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/invoices-pdf/[id]", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it("bez sesji administratora → 401, bez zapytania do API", async () => {
    token.mockResolvedValue(undefined);
    expect((await wywolaj(ID)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["..%2F..%2Fadmin%2Fusers", "abc", `${ID}/x`])("id %s → 400, bez zapytania do API", async (id) => {
    token.mockResolvedValue("t");
    expect((await wywolaj(id)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("poprawny id → PDF z tokenem Bearer, bez cache", async () => {
    token.mockResolvedValue("tok");
    fetchMock.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "content-disposition": 'attachment; filename="FV-1.pdf"' } }));
    const r = await wywolaj(ID);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/admin/invoices/${ID}/pdf$`));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
});
