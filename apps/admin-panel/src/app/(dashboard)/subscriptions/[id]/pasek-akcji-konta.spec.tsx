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

/** Weryfikacja 11.10 (prod): reset FTP bez kont FTP — „Resetuj hasło” wyglądał na aktywny, klik nic nie robił; powód przechodził między akcjami. */
describe("weryfikacja 11.10 — pasek akcji konta", () => {
  it("reset FTP bez dodatkowych kont FTP: „Resetuj hasło” wyszarzony z podpowiedzią, także po wpisaniu powodu", async () => {
    odczyt.mockResolvedValue({ ok: true, wynik: { konta: [], fetchError: null } });
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="ftp"]'));
    expect(odczyt).toHaveBeenCalledWith("s1", "ftp", undefined);
    expect(k.textContent).toContain("Konto nie ma dodatkowych kont FTP.");
    await wpisz(pola()[0], "klient prosi o nowe hasło FTP");
    const b = przycisk('[data-wykonaj="haslo-ftp"]');
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("Konto nie ma dodatkowych kont FTP — nie ma hasła do zresetowania.");
    expect(k.querySelector('[data-podpowiedz="haslo-ftp"]')?.textContent).toBe(b.title);
    expect(b.getAttribute("aria-describedby")).toBe(k.querySelector('[data-podpowiedz="haslo-ftp"]')?.id);
    await klik(b);
    expect(potwierdz).not.toHaveBeenCalled();
    expect(akcja).not.toHaveBeenCalled();
  });

  it("z kontem FTP: podpowiedź mówi, czego brakuje (wybór, potem powód), a po uzupełnieniu znika", async () => {
    odczyt.mockResolvedValue({ ok: true, wynik: { konta: [{ username: "jan@sklep.pl" }], fetchError: null } });
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="ftp"]'));
    expect(przycisk('[data-wykonaj="haslo-ftp"]').title).toBe("Najpierw wybierz z listy.");
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="kopia"]'));
    expect(przycisk('[data-wykonaj="kopia"]').title).toBe("Najpierw wpisz powód (min. 10 znaków).");
    await wpisz(pola()[0], "kopia przed aktualizacją WordPressa");
    expect(przycisk('[data-wykonaj="kopia"]').disabled).toBe(false);
    expect(przycisk('[data-wykonaj="kopia"]').title).toBe("");
    expect(k.querySelector("[data-podpowiedz]")).toBeNull();
  });

  it("przełączenie akcji bez wykonania czyści powód, numer zgłoszenia zostaje", async () => {
    odczyt.mockResolvedValue({ ok: true, wynik: { wToku: false, sprawdzono: null, ostatniSkan: null, razem: 0, znaleziska: [], blad: null, fetchError: null } });
    await render(op("ACCOUNT_ACTIONS"));
    await klik(przycisk('[data-akcja="kopia"]'));
    const [powod, zgloszenie] = pola();
    await wpisz(powod, "kopia przed aktualizacją WordPressa");
    await wpisz(zgloszenie, "#ab12cd34");
    await klik(przycisk('[data-akcja="skan"]'));
    const [powodPo, zgloszeniePo] = pola();
    expect(powodPo.value).toBe("");
    expect(zgloszeniePo.value).toBe("#ab12cd34");
    expect(przycisk('[data-wykonaj="skan"]').disabled).toBe(true);
    // Ponowny klik tej samej akcji nie kasuje tego, co operator już wpisał.
    await wpisz(powodPo, "podejrzenie infekcji po zgłoszeniu");
    await klik(przycisk('[data-akcja="skan"]'));
    expect(pola()[0].value).toBe("podejrzenie infekcji po zgłoszeniu");
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
