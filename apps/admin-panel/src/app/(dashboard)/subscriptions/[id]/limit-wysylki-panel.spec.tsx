/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.1 reszta — limit wysyłki konta: odczyt od L2, zmiana i powrót do domyślnego od L3 z powodem i potwierdzeniem. */
const odczyt = jest.fn();
const zapis = jest.fn();
jest.mock("./poczta-konta-actions", () => ({
  odczytPocztyAction: (...a: unknown[]) => odczyt(...a),
  zapisPocztyAction: (...a: unknown[]) => zapis(...a),
}));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { LimitWysylkiPanel } from "./limit-wysylki-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const STAN = { limitKonta: 300, domyslny: 1000, obowiazuje: 300, max: 100000, wToku: false, kiedy: "2026-10-11T08:00:00.000Z", blad: null, wynik: { login: "klient1", limit: 300, nieczytelny: false, domyslny: 1000 } };
const L3 = { isAdmin: false, permissions: ["MAIL_QUEUE_VIEW", "MAIL_SEND_BLOCK"] };
const L2 = { isAdmin: false, permissions: ["MAIL_QUEUE_VIEW"] };

let root: Root;
let k: HTMLElement;
const render = async (dostep: { isAdmin: boolean; permissions: string[] }) => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<LimitWysylkiPanel subscriptionId="s1" dostep={dostep as never} />));
};
const przycisk = (a: string) => k.querySelector<HTMLButtonElement>(`[data-akcja="${a}"]`)!;
const wpisz = async (pole: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  odczyt.mockReset();
  zapis.mockReset();
  potwierdz.mockClear();
  odczyt.mockResolvedValue({ ok: true, wynik: STAN });
  zapis.mockResolvedValue({ ok: true, wynik: { ok: true } });
});
afterEach(() => act(() => root.unmount()));

it("pokazuje limit, który działa (ustawiony przez obsługę), i wynik z serwera", async () => {
  await render(L3);
  expect(odczyt).toHaveBeenCalledWith("s1", "limit");
  expect(k.textContent).toContain("300 wiadomości na dobę (ustawiony przez obsługę; domyślny 1000)");
  expect(k.textContent).not.toContain("inaczej niż w panelu");
});

it("L3: ustawienie wymaga liczby i powodu; potwierdzenie; zapis z limitem i zgłoszeniem", async () => {
  await render(L3);
  expect(przycisk("ustaw-limit").disabled).toBe(true);
  const [pole, powod, zgl] = [...k.querySelectorAll("input")] as HTMLInputElement[];
  await wpisz(pole, "500");
  expect(przycisk("ustaw-limit").disabled).toBe(true);
  await wpisz(powod, "Kampania klienta po rozmowie");
  await wpisz(zgl, "#ab12cd34");
  await act(async () => przycisk("ustaw-limit").click());
  expect(potwierdz).toHaveBeenCalled();
  expect(zapis).toHaveBeenCalledWith("s1", "limit", { powod: "Kampania klienta po rozmowie", zgloszenie: "#ab12cd34", limit: 500 });
});

it("L3: przywrócenie domyślnego wysyła limit null", async () => {
  await render(L3);
  await wpisz([...k.querySelectorAll("input")][1] as HTMLInputElement, "Koniec kampanii klienta");
  await act(async () => przycisk("domyslny-limit").click());
  expect(zapis).toHaveBeenCalledWith("s1", "limit", expect.objectContaining({ limit: null }));
});

it("L2: odczyt i „Sprawdź na serwerze”, zmiana wyszarzona z powodem", async () => {
  await render(L2);
  expect(przycisk("ustaw-limit").disabled).toBe(true);
  expect(przycisk("ustaw-limit").title).toContain("MAIL_SEND_BLOCK");
  await act(async () => przycisk("wczytaj-limit").click());
  expect(zapis).toHaveBeenCalledWith("s1", "wczytaj-limit", {});
});

it("bez uprawnień: brak odczytu", async () => {
  await render({ isAdmin: false, permissions: [] });
  expect(odczyt).not.toHaveBeenCalled();
  expect(k.textContent).toContain("limit wysyłki niedostępny");
});
