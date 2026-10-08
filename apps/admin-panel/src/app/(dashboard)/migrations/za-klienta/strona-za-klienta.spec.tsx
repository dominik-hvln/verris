import { renderToStaticMarkup } from "react-dom/server";

/**
 * ADMIN-MIGR — strona „Migracja za klienta” w panelu admina czyta usługę trasą `staff/migrations/za-klienta/usluga/:id`
 * (to samo uprawnienie co założenie migracji), błędy 404/403 mówi po ludzku, bez konta hostingowego nie pokazuje formularza.
 */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("./formularz-za-klienta", () => ({
  FormularzZaKlienta: (p: { subscriptionId: string; klient: string; email: string; domenaKonta: string }) => (
    <div data-formularz={p.subscriptionId}>
      {p.klient} · {p.email} · {p.domenaKonta}
    </div>
  ),
}));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import MigracjaZaKlientaPage from "./page";

const api = adminApi as jest.Mock;
const Blad = AdminApiError as unknown as new (m: string, s: number) => Error;
const SUB = "00000000-0000-4000-8000-000000000046";

const render = async (subscriptionId?: string) =>
  renderToStaticMarkup(await MigracjaZaKlientaPage({ searchParams: Promise.resolve({ subscriptionId }) }));

beforeEach(() => api.mockReset());

it("z ID usługi → formularz z danymi klienta, usługa czytana trasą migracji za klienta", async () => {
  api.mockResolvedValue({ id: SUB, user: { email: "jan@firma.pl", firstName: "Jan", lastName: "Kowalski" }, account: { domain: "firma.pl" } });
  const html = await render(SUB);
  expect(html).toContain(`data-formularz="${SUB}"`);
  expect(html).toContain("Jan Kowalski · jan@firma.pl · firma.pl");
  expect(api.mock.calls.map((c) => c[0])).toEqual([`/staff/migrations/za-klienta/usluga/${SUB}`]);
  expect(html).toContain('href="/migrations"');
});

it("klient bez imienia → e-mail jako nazwa", async () => {
  api.mockResolvedValue({ id: SUB, user: { email: "jan@firma.pl", firstName: null, lastName: null }, account: { domain: "firma.pl" } });
  expect(await render(SUB)).toContain("jan@firma.pl · jan@firma.pl · firma.pl");
});

it("usługa bez konta hostingowego → komunikat zamiast formularza", async () => {
  api.mockResolvedValue({ id: SUB, user: { email: "jan@firma.pl", firstName: null, lastName: null }, account: null });
  const html = await render(SUB);
  expect(html).toContain("nie ma konta hostingowego");
  expect(html).not.toContain("data-formularz");
});

it("404 / 403 / awaria → czytelny komunikat przy polu ID usługi", async () => {
  api.mockRejectedValueOnce(new Blad("Nie znaleziono usługi.", 404));
  expect(await render(SUB)).toContain("Nie znaleziono usługi o tym ID.");
  api.mockRejectedValueOnce(new Blad("Brak uprawnień.", 403));
  expect(await render(SUB)).toContain("Twoja rola nie ma uprawnienia „Migracje (cockpit)”");
  api.mockRejectedValueOnce(new Error("ECONNREFUSED"));
  const html = await render(SUB);
  expect(html).toContain("Nie udało się pobrać usługi");
  expect(html).toContain("ID usługi klienta");
});

it("bez ID usługi → samo pole, bez wywołań API", async () => {
  const html = await render();
  expect(html).toContain("ID usługi klienta");
  expect(api).not.toHaveBeenCalled();
});
