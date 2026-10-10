/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * F2.2 — pasek akcji konta: uprawnienia jak w API (ACCOUNT_ACTIONS / DNS_MANAGE, bez nich wyszarzone z informacją),
 * powód obowiązkowy (min. 10 znaków) przed wykonaniem, potwierdzenie, numer zgłoszenia do API, komunikat bez hasła.
 */
const akcja = jest.fn();
const odczyt = jest.fn();
jest.mock("./pasek-akcji-konta-actions", () => ({
  akcjaKontaAction: (...a: unknown[]) => akcja(...a),
  odczytDlaPaskaAction: (...a: unknown[]) => odczyt(...a),
}));
const potwierdz = jest.fn(async () => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...(a as [])) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { komunikatPoAkcji, PasekAkcjiKonta, PRZYCISKI_PASKA } from "./pasek-akcji-konta";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;
const op = (...permissions: string[]) => ({ isAdmin: false, permissions });

const render = async (dostep: { isAdmin: boolean; permissions: string[] }) => {
  await act(async () => {
    root.render(<PasekAkcjiKonta subscriptionId="s1" dostep={dostep} />);
  });
};
const przycisk = (sel: string) => k.querySelector<HTMLButtonElement>(sel)!;
const wpisz = async (pole: HTMLInputElement, tekst: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const klik = async (b: HTMLElement) => {
  await act(async () => {
    b.click();
  });
};
const pola = () => [...k.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])")];

beforeEach(() => {
  akcja.mockReset();
  odczyt.mockReset();
  potwierdz.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

describe("F2.2 — pasek akcji konta", () => {
  it("L1 bez ACCOUNT_ACTIONS: wszystkie wyszarzone z informacją; L2: bez DNS; L3 i administrator — wszystkie", async () => {
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    for (const p of PRZYCISKI_PASKA) {
      expect(przycisk(`[data-akcja="${p.id}"]`).disabled).toBe(true);
      expect(przycisk(`[data-akcja="${p.id}"]`).title).toBe(`Wymaga ${p.perm}`);
    }
    await render(op("ACCOUNT_ACTIONS"));
    expect(PRZYCISKI_PASKA.filter((p) => przycisk(`[data-akcja="${p.id}"]`).disabled).map((p) => p.id)).toEqual(["dns"]);
    await render(op("ACCOUNT_ACTIONS", "DNS_MANAGE"));
    expect(PRZYCISKI_PASKA.filter((p) => przycisk(`[data-akcja="${p.id}"]`).disabled)).toEqual([]);
    await render({ isAdmin: true, permissions: [] });
    expect(PRZYCISKI_PASKA.filter((p) => przycisk(`[data-akcja="${p.id}"]`).disabled)).toEqual([]);
  });

  it("kopia: „Wykonaj” zablokowane bez powodu (min. 10 znaków); po potwierdzeniu API dostaje powód i zgłoszenie", async () => {
    akcja.mockResolvedValue({ ok: true, wynik: { ok: true } });
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="kopia"]'));
    const wykonaj = przycisk('[data-wykonaj="kopia"]');
    expect(wykonaj.disabled).toBe(true);
    const [powod, zgloszenie] = pola();
    await wpisz(powod, "krótko");
    expect(przycisk('[data-wykonaj="kopia"]').disabled).toBe(true);
    await wpisz(powod, "kopia przed aktualizacją WordPressa");
    await wpisz(zgloszenie, "#ab12cd34");
    await klik(przycisk('[data-wykonaj="kopia"]'));
    expect(potwierdz).toHaveBeenCalledTimes(1);
    expect(akcja).toHaveBeenCalledWith("s1", "kopia", { powod: "kopia przed aktualizacją WordPressa", zgloszenie: "#ab12cd34" });
    expect(k.textContent).toContain("Kopia zlecona");
  });

  it("odmowa w potwierdzeniu — nic nie idzie do API; błąd API — komunikat w pasku", async () => {
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="kopia"]'));
    await wpisz(pola()[0], "kopia przed aktualizacją WordPressa");
    potwierdz.mockResolvedValueOnce(false);
    await klik(przycisk('[data-wykonaj="kopia"]'));
    expect(akcja).not.toHaveBeenCalled();
    akcja.mockResolvedValue({ ok: false, error: "Serwer hostingowy jest chwilowo niedostępny." });
    await klik(przycisk('[data-wykonaj="kopia"]'));
    expect(k.querySelector('[role="status"]')?.textContent).toBe("Serwer hostingowy jest chwilowo niedostępny.");
  });

  it("skan: pokazuje ostatni wynik skanera (znaleziska) przed zleceniem", async () => {
    odczyt.mockResolvedValue({
      ok: true,
      wynik: { wToku: false, sprawdzono: "2026-10-10T10:00:00Z", ostatniSkan: "2026-10-10T10:00:00Z", razem: 1, znaleziska: [{ sygnatura: "SMW-INJ-1", sciezka: "/home/u1/public_html/x.php" }], blad: null, fetchError: null },
    });
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="skan"]'));
    expect(odczyt).toHaveBeenCalledWith("s1", "malware", undefined);
    expect(k.querySelector('[data-skan="wynik"]')?.textContent).toContain("SMW-INJ-1");
  });

  it("reset hasła bazy: ostrzeżenie o stronie, która straci połączenie", async () => {
    odczyt.mockResolvedValue({ ok: true, wynik: { bazy: ["u1_wp"], silnik: null, fetchError: null } });
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="baza"]'));
    expect(odczyt).toHaveBeenCalledWith("s1", "bazy", undefined);
    expect(k.querySelector('[data-ostrzezenie="baza"]')?.textContent).toContain("straci połączenie");
  });
});

describe("F2.2 — komunikat po akcji", () => {
  it("reset hasła: mówi, czy klient dostał mail — nigdy nie pokazuje hasła", () => {
    expect(komunikatPoAkcji("skrzynka", { ok: true, mailDoKlienta: true, klient: "anna@klient.pl" })).toBe(
      "Hasło zresetowane. Klient dostał mail (anna@klient.pl) z linkiem do ustawienia nowego.",
    );
    expect(komunikatPoAkcji("ftp", { ok: true, mailDoKlienta: false, klient: "anna@klient.pl" })).toContain("maila nie udało się wysłać");
  });
});
