import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({ ADMIN_COOKIE_NAME: "admin_auth_token", getAdminAuthToken: jest.fn() }));
import { getAdminAuthToken } from "@/lib/auth";
import { GET } from "./route";

/** X-05 — SSO do Grafany z panelu admina: bez sesji na logowanie, przekierowanie tylko do Grafany. */
const token = getAdminAuthToken as jest.Mock;
const wywolaj = (q = "") => GET(new NextRequest(`https://admin.verris.pl/grafana/sso${q}`));

describe("GET /grafana/sso (admin)", () => {
  const env = process.env.NEXT_PUBLIC_GRAFANA_URL;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GRAFANA_URL = "https://grafana.verris.pl";
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_GRAFANA_URL = env;
  });

  it("bez sesji → logowanie, bez ciasteczka", async () => {
    token.mockResolvedValue(undefined);
    const r = await wywolaj();
    expect(r.headers.get("location")).toBe("https://admin.verris.pl/login");
    expect(r.cookies.get("admin_auth_token")).toBeUndefined();
  });

  it.each(["https://evil.example/x", "//evil.example", "javascript:alert(1)"])("to=%s → zostaje w Grafanie", async (cel) => {
    token.mockResolvedValue("tok");
    const r = await wywolaj(`?to=${encodeURIComponent(cel)}`);
    expect(new URL(r.headers.get("location")!).origin).toBe("https://grafana.verris.pl");
  });
});
