import { NextRequest } from "next/server";
import { GET } from "./route";

/** Przekazanie sesji impersonacji: tylko token z impersonatedBy i tylko przekierowanie w obrębie panelu. */
const jwt = (payload: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
const wywolaj = (q: string) => GET(new NextRequest(`https://panel.verris.pl/impersonate?${q}`));

describe("GET /impersonate", () => {
  const env = process.env.CLIENT_PANEL_URL;
  beforeAll(() => {
    process.env.CLIENT_PANEL_URL = "https://panel.verris.pl";
  });
  afterAll(() => {
    process.env.CLIENT_PANEL_URL = env;
  });

  it("token impersonacji → ciasteczko i przekierowanie do panelu", async () => {
    const r = await wywolaj(`token=${jwt({ sub: "u1", impersonatedBy: "op" })}&returnTo=/dashboard/services`);
    expect(r.headers.get("location")).toBe("https://panel.verris.pl/dashboard/services");
    expect(r.cookies.get("auth_token")?.value).toBeTruthy();
  });

  it("zwykły token (bez impersonatedBy) → odmowa, bez ciasteczka (login CSRF)", async () => {
    const r = await wywolaj(`token=${jwt({ sub: "napastnik" })}`);
    expect(r.headers.get("location")).toContain("error=impersonation_invalid");
    expect(r.cookies.get("auth_token")).toBeUndefined();
  });

  it.each(["//evil.example", "/\\\\evil.example", "https://evil.example"])("returnTo %s → zostaje w panelu", async (cel) => {
    const r = await wywolaj(`token=${jwt({ sub: "u1", impersonatedBy: "op" })}&returnTo=${encodeURIComponent(cel)}`);
    expect(r.headers.get("location")).toBe("https://panel.verris.pl/dashboard");
  });
});
