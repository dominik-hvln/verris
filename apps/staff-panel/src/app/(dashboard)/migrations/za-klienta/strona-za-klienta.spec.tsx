import { renderToStaticMarkup } from "react-dom/server";

/**
 * PB-45 — strona „Migracja za klienta” czyta usługę za tym samym uprawnieniem, co założenie migracji
 * (MIGRATIONS_MANAGE). Wcześniej brała ją z GET /admin/subscriptions/:id (SUBSCRIPTIONS_MANAGE): operator
 * z rolą „Operacje” (MIGRATIONS_MANAGE bez SUBSCRIPTIONS_MANAGE) dostawał „Brak uprawnienia…” i nie mógł
 * wypełnić formularza, choć API pozwalało mu migrację założyć.
 */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("lucide-react", () => ({ ArrowLeft: () => null }));
jest.mock("./formularz-za-klienta", () => ({
  FormularzZaKlienta: (p: { subscriptionId: string; klient: string; email: string; domenaKonta: string }) => (
    <div data-formularz={p.subscriptionId}>
      {p.klient} · {p.email} · {p.domenaKonta}
    </div>
  ),
}));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn() };
});

import { staffApi, StaffApiError } from "@/lib/staff-api";
import MigracjaZaKlientaPage from "./page";

const api = staffApi as jest.Mock;
const Blad = StaffApiError as unknown as new (m: string, s: number) => Error;
const SUB = "00000000-0000-4000-8000-000000000045";

const render = async (subscriptionId?: string) =>
  renderToStaticMarkup(await MigracjaZaKlientaPage({ searchParams: Promise.resolve({ subscriptionId }) }));

beforeEach(() => api.mockReset());

it("operator z MIGRATIONS_MANAGE bez SUBSCRIPTIONS_MANAGE widzi formularz z danymi klienta", async () => {
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === `/staff/migrations/za-klienta/usluga/${SUB}`) {
      return { id: SUB, user: { email: "jan@firma.pl", firstName: "Jan", lastName: "Kowalski" }, account: { domain: "firma.pl" } };
    }
    throw new Blad("Twoja rola nie ma uprawnień do tej operacji.", 403);
  });
  const html = await render(SUB);
  expect(html).toContain(`data-formularz="${SUB}"`);
  expect(html).toContain("Jan Kowalski · jan@firma.pl · firma.pl");
  expect(api.mock.calls.map((c) => c[0])).not.toContain(`/admin/subscriptions/${SUB}`);
});

it("usługa bez konta hostingowego → komunikat zamiast formularza", async () => {
  api.mockResolvedValue({ id: SUB, user: { email: "jan@firma.pl", firstName: null, lastName: null }, account: null });
  const html = await render(SUB);
  expect(html).toContain("nie ma konta hostingowego");
  expect(html).not.toContain("data-formularz");
});

it("404 / 403 → czytelny komunikat przy polu ID usługi", async () => {
  api.mockRejectedValueOnce(new Blad("Nie znaleziono usługi.", 404));
  expect(await render(SUB)).toContain("Nie znaleziono usługi o tym ID.");
  api.mockRejectedValueOnce(new Blad("Brak uprawnień.", 403));
  expect(await render(SUB)).toContain("Twoja rola nie ma uprawnienia „Migracje (cockpit)”");
});

it("bez ID usługi → samo pole, bez wywołań API", async () => {
  const html = await render();
  expect(html).toContain("ID usługi klienta");
  expect(api).not.toHaveBeenCalled();
});
