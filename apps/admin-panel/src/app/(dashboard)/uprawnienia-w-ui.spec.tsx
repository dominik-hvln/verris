import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B — „Dodaj węzeł” (POST admin/servers, tylko ADMIN) na liście węzłów tylko dla administratora;
 * kolejka zakładania linkuje do klienta, usługi i węzła tylko wtedy, gdy rola otworzy ich kartę.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn(), adminApiMultipart: jest.fn() };
});

import { adminApi } from "@/lib/api";
import ListaWezlow from "./nodes/page";
import KolejkaZadan from "./provisioning-queue/page";

const api = adminApi as jest.Mock;
const ADMIN = { role: "ADMIN", isAdmin: true, permissions: [] };
const operator = (...permissions: string[]) => ({ role: "STAFF", isAdmin: false, permissions });

function odpowiedzi(dostep: unknown, inne: Record<string, unknown>) {
  api.mockReset();
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === "/staff/me/access") return dostep;
    const k = Object.keys(inne).find((x) => sciezka.startsWith(x));
    if (k) return inne[k];
    throw new Error("ECONNREFUSED");
  });
}

describe("Lista węzłów", () => {
  const wezly = { "/admin/servers/flota": [], "/admin/servers": [] };

  it("operator z NODES_VIEW: bez „Dodaj węzeł” i „Operacji floty”, także w pustym stanie", async () => {
    odpowiedzi(operator("NODES_VIEW"), wezly);
    const html = renderToStaticMarkup(await ListaWezlow());
    expect(html).not.toContain('href="/nodes/wizard"');
    expect(html).not.toContain('href="/nodes/stack"');
    expect(html).toContain("Nowy węzeł doda administrator.");
  });

  it("administrator: „Dodaj węzeł” i kreator w pustym stanie", async () => {
    odpowiedzi(ADMIN, wezly);
    const html = renderToStaticMarkup(await ListaWezlow());
    expect(html).toContain('href="/nodes/wizard"');
    expect(html).toContain('href="/nodes/stack"');
  });
});

describe("Kolejka zakładania", () => {
  const kolejka = {
    "/admin/provisioning-queue": {
      async: true,
      counts: { failed: 1 },
      rows: [
        {
          id: "j1",
          name: "provision",
          state: "failed",
          timestamp: 0,
          attemptsMade: 1,
          finishedOn: null,
          processedOn: null,
          failedReason: "x",
          failedCategory: "transient",
          data: { type: "wallet", subscriptionId: "s1", userId: "u1", domain: "sklep.pl", preferredRegion: null },
          subscription: {
            status: "PROVISIONING",
            provisioningStage: null,
            provisioningAttempts: 1,
            provisioningLastError: null,
            user: { email: "jan@firma.pl", firstName: null, lastName: null },
            account: { id: "a1", daUsername: "sklep", serverId: "w1" },
          },
        },
      ],
    },
    "/admin/servers/node-tasks": [],
  };
  const render = async () => renderToStaticMarkup(await KolejkaZadan({ searchParams: Promise.resolve({}) }));

  it("rola z samym PROVISIONING_MANAGE: klient, usługa i węzeł jako tekst, bez linków do odmowy", async () => {
    odpowiedzi(operator("PROVISIONING_MANAGE"), kolejka);
    const html = await render();
    expect(html).toContain("jan@firma.pl");
    expect(html).not.toContain('href="/customers/u1"');
    expect(html).not.toContain('href="/subscriptions/s1"');
    expect(html).not.toContain('href="/nodes/w1"');
  });

  it("z CUSTOMERS_VIEW i NODES_VIEW (oraz admin): linki do kart", async () => {
    odpowiedzi(operator("PROVISIONING_MANAGE", "CUSTOMERS_VIEW", "NODES_VIEW"), kolejka);
    const html = await render();
    expect(html).toContain('href="/customers/u1"');
    expect(html).toContain('href="/subscriptions/s1"');
    expect(html).toContain('href="/nodes/w1"');
    odpowiedzi(ADMIN, kolejka);
    expect(await render()).toContain('href="/customers/u1"');
  });
});
