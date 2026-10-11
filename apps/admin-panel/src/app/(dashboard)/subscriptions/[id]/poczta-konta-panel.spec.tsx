/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * F3.1 (D4) — sekcja „Poczta” karty usługi: blokada wysyłki (MAIL_SEND_BLOCK), kolejka konta (MAIL_QUEUE_VIEW)
 * z nagłówkami bez treści, usunięcie zaznaczonych z podglądem w potwierdzeniu i powodem. Bez uprawnień — wyszarzone.
 */
const odczyt = jest.fn();
const zapis = jest.fn();
jest.mock("./poczta-konta-actions", () => ({
  odczytPocztyAction: (...a: unknown[]) => odczyt(...a),
  zapisPocztyAction: (...a: unknown[]) => zapis(...a),
}));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { PocztaKontaPanel } from "./poczta-konta-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const WYSYLKA = { zablokowana: false, od: null, przez: null, powod: null, naWezle: false, obslugiwana: true, bladWezla: null };
const KOLEJKA = {
  wToku: false,
  wczytano: "2026-10-10T12:00:00.000Z",
  szukaj: null,
  podsumowanie: { wKolejce: 40, przeczytano: 40, pasuje: 2, pokazano: 2 },
  wiadomosci: [
    { id: "1tAbCd-000000001bo-D342", wiek: "4m", rozmiar: "2.9K", zamrozona: false, nadawca: "klient1@t1", odbiorcy: "a@gmail.com", temat: "Viagra tanio" },
    { id: "1aBcDe-0003hL-9u", wiek: "2h", rozmiar: "12K", zamrozona: true, nadawca: "biuro@klient.pl", odbiorcy: "b@wp.pl", temat: "Faktura" },
  ],
  blad: null,
  usuwanie: null,
  wypchniecie: null,
};

let root: Root;
let k: HTMLElement;
const op = (...permissions: string[]) => ({ isAdmin: false, permissions });
const render = async (dostep: { isAdmin: boolean; permissions: string[] }) => {
  await act(async () => {
    root.render(<PocztaKontaPanel subscriptionId="s1" dostep={dostep} />);
  });
};
const q = <T extends HTMLElement = HTMLButtonElement>(sel: string) => k.querySelector<T>(sel);
const klik = async (b: HTMLElement) => {
  await act(async () => {
    b.click();
  });
};
const wpisz = async (pole: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const powod = () => k.querySelector<HTMLInputElement>('input[placeholder^="np. spam"]')!;

beforeEach(() => {
  odczyt.mockReset();
  zapis.mockReset();
  potwierdz.mockClear();
  odczyt.mockImplementation(async (_s: string, co: string) => ({ ok: true, wynik: co === "wysylka" ? WYSYLKA : KOLEJKA }));
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

describe("F3.1 — poczta konta na karcie usługi", () => {
  it("L1 (bez uprawnień): nic nie wczytuje z serwera, przyciski wyszarzone z nazwą uprawnienia", async () => {
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    expect(odczyt).not.toHaveBeenCalled();
    expect(q('[data-akcja="zablokuj"]')!.disabled).toBe(true);
    expect(q('[data-akcja="zablokuj"]')!.title).toBe("Wymaga MAIL_SEND_BLOCK");
    expect(k.textContent).toContain("Wymaga MAIL_QUEUE_VIEW");
  });

  it("L2: kolejka z nagłówkami (bez zaznaczania), blokada i usuwanie wyszarzone", async () => {
    await render(op("MAIL_QUEUE_VIEW"));
    expect(odczyt.mock.calls.map((c) => c[1]).sort()).toEqual(["kolejka", "wysylka"]);
    expect(k.querySelectorAll("[data-wiadomosc]")).toHaveLength(2);
    expect(k.textContent).toContain("Viagra tanio");
    expect(k.textContent).toContain("zamrożona");
    expect(k.querySelectorAll('[aria-label^="Zaznacz"]')).toHaveLength(0);
    expect(q('[data-akcja="usun"]')!.disabled).toBe(true);
    expect(q('[data-akcja="zablokuj"]')!.disabled).toBe(true);
  });

  it("L3: blokada dopiero z powodem, potwierdzenie mówi o „obsługa Verris”, zgłoszenie do API", async () => {
    zapis.mockResolvedValue({ ok: true, wynik: { ok: true } });
    await render(op("MAIL_QUEUE_VIEW", "MAIL_SEND_BLOCK"));
    expect(q('[data-akcja="zablokuj"]')!.disabled).toBe(true);
    await wpisz(powod(), "Spam z formularza kontaktowego");
    await wpisz(k.querySelector<HTMLInputElement>('input[placeholder="#ab12cd34"]')!, "#ab12cd34");
    await klik(q('[data-akcja="zablokuj"]')!);
    expect(String(potwierdz.mock.calls[0]![0])).toContain("obsługa Verris");
    expect(zapis).toHaveBeenCalledWith("s1", "zablokuj", expect.objectContaining({ powod: "Spam z formularza kontaktowego", zgloszenie: "#ab12cd34" }));
  });

  it("L3: usunięcie zaznaczonych — potwierdzenie z listą (nadawca, odbiorca, temat), do API tylko zaznaczone id", async () => {
    zapis.mockResolvedValue({ ok: true, wynik: { ok: true, zlecono: 1 } });
    await render(op("MAIL_QUEUE_VIEW", "MAIL_SEND_BLOCK"));
    await wpisz(powod(), "Spam z formularza kontaktowego");
    await klik(q<HTMLInputElement>('input[aria-label="Zaznacz 1tAbCd-000000001bo-D342"]')!);
    await klik(q('[data-akcja="usun"]')!);
    const pytanie = String(potwierdz.mock.calls[0]![0]);
    expect(pytanie).toContain("1 wiadomość");
    expect(pytanie).toContain("klient1@t1 → a@gmail.com: Viagra tanio");
    expect(potwierdz.mock.calls[0]![1]).toMatchObject({ niebezpieczne: true });
    expect(zapis).toHaveBeenCalledWith("s1", "usun", expect.objectContaining({ ids: ["1tAbCd-000000001bo-D342"] }));
  });

  it("anulowane potwierdzenie — nic do API; rozjazd panel/serwer widoczny", async () => {
    potwierdz.mockResolvedValueOnce(false);
    odczyt.mockImplementation(async (_s: string, co: string) => ({ ok: true, wynik: co === "wysylka" ? { ...WYSYLKA, zablokowana: true, naWezle: false, od: "2026-10-10T10:00:00.000Z", powod: "spam" } : KOLEJKA }));
    await render({ isAdmin: true, permissions: [] });
    expect(q("[data-rozjazd]")).not.toBeNull();
    await wpisz(powod(), "Spam z formularza kontaktowego");
    await klik(q('[data-akcja="zwolnij"]')!);
    expect(zapis).not.toHaveBeenCalled();
  });

  it("audyt Fal 2: usuwanie przerwane błędem pokazuje, ile już usunięto (nieodwracalne)", async () => {
    const usuwanie = { wToku: false, kiedy: "2026-10-10T12:05:00.000Z", blad: "exim -Mrm: nie usunięto 1 — Message is locked", usunieto: 50, pominieto: 0 };
    odczyt.mockImplementation(async (_s: string, co: string) => ({ ok: true, wynik: co === "wysylka" ? WYSYLKA : { ...KOLEJKA, usuwanie } }));
    await render(op("MAIL_QUEUE_VIEW"));
    expect(q('[data-usuwanie="wynik"]')!.textContent).toContain("nie powiodło się — exim -Mrm: nie usunięto 1 — Message is locked (wcześniej usunięto już 50)");
  });
});
