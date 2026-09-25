import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * X-05 — każda strona panelu obsługi przy 403 i przy awarii API renderuje się (komunikat na stronie),
 * zamiast wywracać się do „This page couldn’t load”. Przemiata WSZYSTKIE page.tsx — nowa strona
 * wpada pod strażnika sama. Dozwolone wyjątki: przekierowanie i notFound() (świadome zachowanie Next).
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${u}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn(), staffApiMultipart: jest.fn() };
});

import { staffApi, StaffApiError } from "@/lib/staff-api";

const api = staffApi as jest.Mock;
const KATALOG = __dirname;

function strony(dir: string): string[] {
  return readdirSync(dir).flatMap((w) => {
    const p = join(dir, w);
    if (statSync(p).isDirectory()) return strony(p);
    return w === "page.tsx" ? [p] : [];
  });
}

const PARAMS = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", subscriptionId: "00000000-0000-4000-8000-000000000003" }), searchParams: Promise.resolve({}) };
const swiadome = (e: unknown) => /NEXT_(REDIRECT|NOT_FOUND)/.test(String((e as { digest?: string })?.digest ?? ""));

describe.each([
  ["403", () => new (StaffApiError as unknown as new (m: string, s: number) => Error)("Forbidden", 403)],
  ["awaria API", () => new Error("ECONNREFUSED")],
])("strony obsługi przy: %s", (_, blad) => {
  beforeEach(() => {
    api.mockReset();
    api.mockRejectedValue(blad());
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
  });

  it.each(strony(KATALOG).map((p) => [relative(KATALOG, p), p]))("%s", async (_n, plik) => {
    const Strona = (await import(plik)).default as (p: unknown) => Promise<React.ReactElement> | React.ReactElement;
    try {
      const el = await Strona(PARAMS);
      expect(typeof renderToStaticMarkup(el)).toBe("string");
    } catch (e) {
      if (!swiadome(e)) throw e;
    }
  });
});
