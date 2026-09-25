import { NextRequest } from "next/server";
import { GET } from "./route";

/** Przekazanie sesji impersonacji: jednorazowy kod wymieniany po stronie serwera, przekierowanie tylko w panelu. */
const KOD = "a".repeat(43);
const wywolaj = (q: string) => GET(new NextRequest(`https://panel.verris.pl/impersonate?${q}`));

describe("GET /impersonate", () => {
  const env = process.env.CLIENT_PANEL_URL;
  const fetchMock = jest.fn();
  beforeAll(() => {
    process.env.CLIENT_PANEL_URL = "https://panel.verris.pl";
  });
  afterAll(() => {
    process.env.CLIENT_PANEL_URL = env;
  });
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });
  const ok = () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: "tok-imp" }), { status: 200 }));

  it("kod → wymiana w API → ciasteczko i przekierowanie do panelu; token nie w adresie", async () => {
    ok();
    const r = await wywolaj(`code=${KOD}&returnTo=/dashboard/services`);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/handoff$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: KOD });
    expect(r.headers.get("location")).toBe("https://panel.verris.pl/dashboard/services");
    expect(r.cookies.get("auth_token")?.value).toBe("tok-imp");
  });

  it("nieznany albo zużyty kod → logowanie, istniejąca sesja nietknięta", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const r = await wywolaj(`code=${KOD}`);
    expect(r.headers.get("location")).toContain("error=impersonation_invalid");
    expect(r.cookies.get("auth_token")).toBeUndefined();
  });

  it("token w adresie (stary format) i śmieci → odmowa bez zapytania do API", async () => {
    const r = await wywolaj("token=x.eyJpbXBlcnNvbmF0ZWRCeSI6IngifQ.y");
    expect(r.headers.get("location")).toContain("error=impersonation_no_token");
    await wywolaj("code=krotki");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "/\t/evil.example", "/%09/evil.example"])("returnTo %j → zostaje w panelu", async (cel) => {
    ok();
    const r = await wywolaj(`code=${KOD}&returnTo=${encodeURIComponent(cel)}`);
    expect(new URL(r.headers.get("location")!).origin).toBe("https://panel.verris.pl");
  });
});
