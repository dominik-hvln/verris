/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let sciezka = "/nodes/wykresy";
const push = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => sciezka, useRouter: () => ({ push, refresh: () => undefined }) }));
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn().mockResolvedValue([]) }));
jest.mock("./notification-bell", () => ({ NotificationBell: () => null }));
jest.mock("./logout-button", () => ({ LogoutButton: () => null }));
jest.mock("./command-palette-actions", () => ({ globalSearchAction: jest.fn().mockResolvedValue([]) }));

import { AdminShell } from "./admin-shell";
import { szukajStron, type StronaMenu } from "./command-palette";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Menu admina — żadna strona nie jest ukryta", () => {
  let root: Root;
  let el: HTMLElement;
  const render = (permissions: string[] = [], isAdmin = true) =>
    act(() =>
      root.render(
        <AdminShell uzytkownik="Admin" inicjaly="AV" rola="administrator" isAdmin={isAdmin} permissions={permissions} liczniki={null}>
          <p>treść</p>
        </AdminShell>,
      ),
    );
  const menu = () => el.querySelector('aside nav[aria-label="Menu panelu admina"]')!;
  const sekcja = (nazwa: string) => menu().querySelector<HTMLButtonElement>(`button[aria-label$=": ${nazwa}"]`)!;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it("sekcja bieżącej strony rozwinięta, podstrona zaznaczona, inne sekcje mają strzałkę", async () => {
    sciezka = "/nodes/wykresy";
    await render();
    const biezaca = menu().querySelector('a[aria-current="page"]')!;
    expect(biezaca.textContent).toBe("Wykresy i prognozy");
    expect(sekcja("Węzły").getAttribute("aria-expanded")).toBe("true");
    expect(menu().textContent).toContain("Pojemność");
    expect(sekcja("Monitoring").getAttribute("aria-expanded")).toBe("false");
    expect(menu().textContent).not.toContain("Błędy aplikacji");
  });

  it("strzałka rozwija sekcję bez przechodzenia na stronę", async () => {
    sciezka = "/";
    await render();
    await act(async () => sekcja("Oferta i ceny").click());
    expect(sekcja("Oferta i ceny").getAttribute("aria-expanded")).toBe("true");
    expect(menu().querySelector('a[href="/domain-pricing"]')?.textContent).toBe("Domeny i SSL");
    expect(push).not.toHaveBeenCalled();
    await act(async () => sekcja("Oferta i ceny").click());
    expect(menu().querySelector('a[href="/domain-pricing"]')).toBeNull();
  });

  it("operator widzi tylko strony ze swoimi uprawnieniami; sekcja z jedną stroną to zwykły link", async () => {
    sciezka = "/tickets";
    await render(["TICKETS_VIEW", "NODES_VIEW"], false);
    expect(menu().querySelector('a[href="/tickets"]')).not.toBeNull();
    expect(menu().querySelector('a[href="/settings/canned-responses"]')).toBeNull();
    expect(sekcja("Zgłoszenia")).toBeNull();
    expect(menu().querySelector('a[href="/plans"]')).toBeNull();
  });

  it("uprawnienia niedostępne: komunikat i menu bez modułów wymagających uprawnień", async () => {
    sciezka = "/";
    await act(async () =>
      root.render(
        <AdminShell uzytkownik="Admin" inicjaly="AV" rola="brak uprawnień" isAdmin={false} permissions={[]} uprawnieniaNiedostepne liczniki={null}>
          <p>treść</p>
        </AdminShell>,
      ),
    );
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się pobrać Twoich uprawnień");
    expect(menu().querySelector('a[href="/nodes"]')).toBeNull();
    expect(menu().querySelector('a[href="/settings/platform"]')).toBeNull();
  });
});

describe("Wyszukiwarka stron", () => {
  const strony: StronaMenu[] = [
    { name: "Wykresy i prognozy", href: "/nodes/wykresy", sekcja: "Węzły", szukaj: "cpu ram prognoza ai przeciążenie" },
    { name: "Pojemność", href: "/nodes/capacity", sekcja: "Węzły", szukaj: "zużycie sprzedane overcommit" },
    { name: "Domeny i SSL", href: "/domain-pricing", sekcja: "Oferta i ceny", szukaj: "certyfikaty whois ceny" },
    { name: "Plany produktowe", href: "/plans", sekcja: "Oferta i ceny", szukaj: "pakiety cennik" },
  ];
  it("bez polskich znaków, po słowach kluczowych i sekcji; nazwa przed słowem kluczowym", () => {
    expect(szukajStron(strony, "pojemnosc").map((s) => s.href)).toEqual(["/nodes/capacity"]);
    expect(szukajStron(strony, "SSL").map((s) => s.href)).toEqual(["/domain-pricing"]);
    expect(szukajStron(strony, "prognoza").map((s) => s.href)).toEqual(["/nodes/wykresy"]);
    expect(szukajStron(strony, "węzły").map((s) => s.href)).toEqual(["/nodes/wykresy", "/nodes/capacity"]);
    expect(szukajStron(strony, "ceny").map((s) => s.href)).toEqual(["/domain-pricing", "/plans"]);
    expect(szukajStron(strony, "  ")).toEqual([]);
  });
});

describe("Wyszukiwarka „/” w nagłówku", () => {
  it("wpisanie „ssl” pokazuje stronę i Enter na nią przechodzi", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    sciezka = "/";
    await act(async () =>
      root.render(
        <AdminShell uzytkownik="Admin" inicjaly="AV" rola="administrator" isAdmin permissions={[]} liczniki={null}>
          <p>treść</p>
        </AdminShell>,
      ),
    );
    await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true })));
    await act(async () => new Promise((r) => setTimeout(r, 40)));
    const pole = document.querySelector<HTMLInputElement>('input[aria-label="Szukaj"]')!;
    const ustaw = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      ustaw.call(pole, "ssl");
      pole.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Domeny i SSL");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Strona · Oferta i ceny");
    await act(async () => pole.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(push).toHaveBeenCalledWith("/domain-pricing");
    act(() => root.unmount());
    el.remove();
  });
});
