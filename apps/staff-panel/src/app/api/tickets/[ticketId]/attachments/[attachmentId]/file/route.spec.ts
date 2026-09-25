const ciasteczka = { get: jest.fn() };
jest.mock("next/headers", () => ({ cookies: async () => ciasteczka }));
import { GET } from "./route";

/** X-05 — pobieranie załącznika zgłoszenia w panelu obsługi: walidacja id, sesja, przekazanie pliku. */
const T = "8f1c2b3a-4d5e-4f60-9a1b-2c3d4e5f6a7b";
const A = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const wywolaj = (ticketId: string, attachmentId: string) =>
  GET(new Request("https://staff.verris.pl/x"), { params: Promise.resolve({ ticketId, attachmentId }) });

describe("GET /api/tickets/[ticketId]/attachments/[attachmentId]/file", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    ciasteczka.get.mockReset();
    global.fetch = fetchMock as never;
  });

  it.each([["..", A], [T, "../../users"]])("id spoza UUID (%s / %s) → 400 bez zapytania", async (t, a) => {
    ciasteczka.get.mockReturnValue({ value: "tok" });
    expect((await wywolaj(t, a)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bez sesji obsługi → 401", async () => {
    ciasteczka.get.mockReturnValue(undefined);
    expect((await wywolaj(T, A)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("plik z API przechodzi z nagłówkami typu i nazwy", async () => {
    ciasteczka.get.mockReturnValue({ value: "tok" });
    fetchMock.mockResolvedValue(new Response("abc", { status: 200, headers: { "content-type": "image/png", "content-disposition": 'attachment; filename="a.png"' } }));
    const r = await wywolaj(T, A);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
});
