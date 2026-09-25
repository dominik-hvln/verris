import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({ getAdminAuthToken: jest.fn() }));
jest.mock("@/lib/api", () => ({ API_URL: "http://api.test" }));
import { getAdminAuthToken } from "@/lib/auth";
import { GET } from "./route";

/** X-05 — SSO do Grafany: bilet z API, bez ciasteczka panelu, przekierowanie tylko do Grafany. */
const token = getAdminAuthToken as jest.Mock;
const fetchMock = jest.fn();
const wywolaj = (q = "") => GET(new NextRequest(`https://admin.verris.pl/grafana/sso${q}`));

describe("GET /grafana/sso (admin)", () => {
  const env = process.env.NEXT_PUBLIC_GRAFANA_URL;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GRAFANA_URL = "https://grafana.verris.pl";
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_GRAFANA_URL = env;
  });
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ code: "k".repeat(43) }) });
  });

  it("bez sesji → logowanie, bez biletu", async () => {
    token.mockResolvedValue(undefined);
    const r = await wywolaj();
    expect(r.headers.get("location")).toBe("https://admin.verris.pl/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("z sesją → bilet z API i przekierowanie na /verris-sso, bez ciasteczek", async () => {
    token.mockResolvedValue("tok");
    const r = await wywolaj(`?to=${encodeURIComponent("/d/abc?orgId=1")}`);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/auth/grafana-ticket",
      expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer tok" } }),
    );
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://grafana.verris.pl/verris-sso");
    expect(loc.searchParams.get("code")).toBe("k".repeat(43));
    expect(loc.searchParams.get("to")).toBe("/d/abc?orgId=1");
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("API odmawia → 403 bez przekierowania", async () => {
    token.mockResolvedValue("tok");
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const r = await wywolaj();
    expect(r.status).toBe(403);
  });

  it.each(["https://evil.example/x", "//evil.example", "javascript:alert(1)"])("to=%s → zostaje w Grafanie", async (cel) => {
    token.mockResolvedValue("tok");
    const r = await wywolaj(`?to=${encodeURIComponent(cel)}`);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin).toBe("https://grafana.verris.pl");
    expect(loc.searchParams.get("to")!.startsWith("//")).toBe(false);
  });
});
