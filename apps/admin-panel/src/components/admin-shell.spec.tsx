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
/** Odpowiedzi API wyszukiwarki według zapytania (debounce z poprzedniego testu nie zjada odpowiedzi następnego). */
const odpowiedziApi: Record<string, unknown> = {};
const mockSzukaj = jest.fn(async (q: string) => odpowiedziApi[q] ?? { results: [], pominiete: [] });
jest.mock("./command-palette-actions", () => ({ globalSearchAction: (...a: unknown[]) => mockSzukaj(...a) }));

import { AdminShell } from "./admin-shell";
import { komunikatPominietych, szukajStron, type StronaMenu } from "./command-palette";

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
    await act(async () => sekcja("Autoskalowanie").click());
    expect(sekcja("Autoskalowanie").getAttribute("aria-expanded")).toBe("true");
    expect(menu().querySelector('a[href="/autoscaling/revenue"]')?.textContent).toBe("Przychody");
    expect(push).not.toHaveBeenCalled();
    await act(async () => sekcja("Autoskalowanie").click());
    expect(menu().querySelector('a[href="/autoscaling/revenue"]')).toBeNull();
  });

  it("7 grup z propozycji 10.10 (sekcja A) i jedna pozycja w stopce", async () => {
    sciezka = "/";
    await render();
    const naglowki = [...menu().querySelectorAll("div.uppercase")].map((d) => d.textContent);
    expect(naglowki).toEqual(["Flota", "Klienci i usługi", "Finanse", "Oferta", "Wiedza i AI", "System"]);
    expect(menu().querySelector('a[href="/nodes/wizard"]')?.textContent).toBe("Dodaj węzeł");
    expect(menu().querySelector('a[href="/nodes/stack"]')?.textContent).toBe("Operacje floty");
    expect(menu().querySelector('a[href="/product-ops"]')?.textContent).toBe("Komunikaty i flagi");
    expect(sekcja("Zespół")).not.toBeNull();
    expect(sekcja("Bezpieczeństwo i zgodność")).not.toBeNull();
    const stopka = [...el.querySelectorAll("aside a")].filter((a) => !a.closest("nav"));
    expect(stopka.map((a) => a.getAttribute("href"))).toEqual(["/settings"]);
  });

  it("Operacje floty z NODES_MANAGE (nie PLANS_MANAGE); kreator tylko dla administratora", async () => {
    sciezka = "/nodes";
    await render(["NODES_VIEW", "NODES_MANAGE"], false);
    expect(menu().querySelector('a[href="/nodes/stack"]')).not.toBeNull();
    expect(menu().querySelector('a[href="/nodes/wizard"]')).toBeNull();
    await render(["NODES_VIEW", "PLANS_MANAGE"], false);
    expect(menu().querySelector('a[href="/nodes/stack"]')).toBeNull();
    expect(menu().querySelector('a[href="/plans"]')).not.toBeNull();
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

  it("początek nazwy > słowo w nazwie > fragment > słowa kluczowe", () => {
    const s: StronaMenu[] = [
      { name: "Kopie offsite", href: "/a", sekcja: "Ustawienia", szukaj: "backup" },
      { name: "Lista węzłów", href: "/b", sekcja: "Węzły", szukaj: "kopie" },
      { name: "Twoje kopie", href: "/c", sekcja: "Konto" },
      { name: "Odkopie", href: "/d", sekcja: "Konto" },
    ];
    expect(szukajStron(s, "kopie").map((x) => x.href)).toEqual(["/a", "/c", "/d", "/b"]);
  });
});

describe("Komunikat przy braku uprawnień", () => {
  it("lista typów w dopełniaczu; wszystkie — tylko strony; żadnego — null", () => {
    expect(komunikatPominietych([])).toBeNull();
    expect(komunikatPominietych(["node"])).toBe("Brak wyników. Twoja rola nie przeszukuje węzłów.");
    expect(komunikatPominietych(["user", "node", "invoice"])).toBe("Brak wyników. Twoja rola nie przeszukuje klientów, węzłów ani faktur.");
    expect(komunikatPominietych(["user", "service", "domain", "invoice", "node", "ticket", "migration"])).toBe("Brak wyników. Twoja rola przeszukuje tylko strony panelu.");
  });
});

describe("Cmd+K — słowa kluczowe i strony spoza menu", () => {
  let root: Root;
  let el: HTMLElement;
  const otworz = async (permissions: string[] = [], isAdmin = true) => {
    sciezka = "/";
    await act(async () =>
      root.render(
        <AdminShell uzytkownik="Admin" inicjaly="AV" rola="administrator" isAdmin={isAdmin} permissions={permissions} liczniki={null}>
          <p>treść</p>
        </AdminShell>,
      ),
    );
    await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })));
    await act(async () => new Promise((r) => setTimeout(r, 40)));
  };
  const wpisz = async (tekst: string) => {
    const pole = document.querySelector<HTMLInputElement>('input[aria-label="Szukaj"]')!;
    const ustaw = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      ustaw.call(pole, tekst);
      pole.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return document.querySelector('[role="dialog"][aria-label="Wyszukiwarka"]')!.textContent ?? "";
  };
  beforeEach(() => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it.each([
    ["onboard", "Lista węzłów"],
    ["drain", "Lista węzłów"],
    ["offsite", "Kopie offsite"],
    ["korekta", "Faktury"],
    ["ksef", "Dane firmy"],
    ["kreator", "Dodaj węzeł"],
    ["za klienta", "Migracja za klienta"],
    ["passkey", "Twoje konto"],
    ["break-glass", "Twoje konto"],
  ])("„%s” → %s", async (q, strona) => {
    await otworz();
    expect(await wpisz(q)).toContain(strona);
  });

  it("strony spoza menu z tym samym filtrem uprawnień; działania bez uprawnień wyszarzone z powodem", async () => {
    await otworz(["BILLING_VIEW"], false);
    const tekst = await wpisz("faktur");
    expect(tekst).toContain("Czeka na fakturę");
    const reczna = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-disabled="true"]')].find((b) => b.textContent?.includes("Faktura ręczna"));
    expect(reczna?.title).toBe("Wymaga BILLING_MANAGE");
    expect(await wpisz("przychody")).not.toContain("Przychody z autoskalowania");
    expect(await wpisz("kreator")).toContain("Wymaga roli administratora");
  });

  it("strona menu o adresie działania pojawia się raz — jako działanie", async () => {
    await otworz();
    await wpisz("kreator");
    const pozycje = [...document.querySelectorAll('[role="dialog"] button')].filter((b) => b.textContent?.startsWith("Dodaj węzeł"));
    expect(pozycje).toHaveLength(1);
  });

  it("puste wyniki z powodu uprawnień — komunikat zamiast „Brak wyników”", async () => {
    odpowiedziApi["zzz9"] = { results: [], pominiete: ["node", "invoice"] };
    await otworz(["CUSTOMERS_VIEW"], false);
    await wpisz("zzz9");
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(document.querySelector('[role="dialog"][aria-label="Wyszukiwarka"]')!.textContent).toContain("Brak wyników. Twoja rola nie przeszukuje węzłów ani faktur.");
  });

  it("węzeł z API jest wynikiem i prowadzi do karty", async () => {
    odpowiedziApi["t1"] = { results: [{ type: "node", id: "n1", title: "t1", subtitle: "Węzeł · t1.verris.net", href: "/nodes/n1", status: "ACTIVE" }], pominiete: [] };
    await otworz();
    await wpisz("t1");
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(document.querySelector('[role="dialog"][aria-label="Wyszukiwarka"]')!.textContent).toContain("Węzeł · t1.verris.net");
    const pole = document.querySelector<HTMLInputElement>('input[aria-label="Szukaj"]')!;
    await act(async () => pole.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(push).toHaveBeenLastCalledWith("/nodes/n1");
  });

  it("przycisk pokazuje skrót Ctrl K (⌘K na Macu)", async () => {
    await otworz();
    const przycisk = el.querySelector<HTMLButtonElement>('button[aria-keyshortcuts]')!;
    expect(przycisk.querySelector("kbd")?.textContent).toBe("Ctrl K");
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
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Strona · Oferta");
    await act(async () => pole.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(push).toHaveBeenCalledWith("/domain-pricing");
    act(() => root.unmount());
    el.remove();
  });
});
