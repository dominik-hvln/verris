/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * F3.2 (D5, G-12) — sekcja „Bezpieczeństwo konta” karty usługi: „Zablokowało mi IP” (adresy klienta, sprawdź, odblokuj
 * z powodem i potwierdzeniem), złośliwe pliki → kwarantanna z listą w potwierdzeniu i przywrócenie, trafienia WAF
 * (tryb tylko do odczytu, wczytanie z serwera). Bez uprawnień — nic nie czyta, przyciski wyszarzone.
 */
const odczyt = jest.fn();
const zapis = jest.fn();
jest.mock("./bezpieczenstwo-konta-actions", () => ({
  odczytBezpieczenstwaAction: (...a: unknown[]) => odczyt(...a),
  zapisBezpieczenstwaAction: (...a: unknown[]) => zapis(...a),
}));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { BezpieczenstwoKontaPanel } from "./bezpieczenstwo-konta-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PLIK = "domains/klient.pl/public_html/wp-content/uploads/x.php";
const IP = {
  adresy: [
    { ip: "83.12.44.201", zrodla: ["zgloszenie"], ostatnio: "2026-10-10T10:00:00Z", zgloszenia: ["ab12cd34-0000-4000-8000-000000000001"] },
    { ip: "46.205.1.10", zrodla: ["logowanie"], ostatnio: "2026-10-10T09:00:00Z", zgloszenia: [] },
  ],
  wToku: false,
  sprawdzenie: { ip: "83.12.44.201", wToku: false, kiedy: "2026-10-10T10:05:00Z", blokady: [{ ip: "83.12.44.201", jail: "dovecot", powod: "nieudane logowania IMAP/POP3 (odbiór poczty)", od: "2026-10-10T10:00:00Z", do: "2026-10-10T11:00:00Z", stala: false }], blad: null },
  operacja: null,
};
const MALWARE = {
  wToku: false, sprawdzono: "2026-10-10T10:00:00Z", ostatniSkan: "2026-10-10T09:00:00Z", razem: 1,
  znaleziska: [{ sygnatura: "SMW-INJ-1", sciezka: PLIK, doKwarantanny: true }],
  kwarantanna: [{ id: `20261009T100000Z-ab12/domains/klient.pl/public_html/old.php`, czas: "2026-10-09T10:00:00Z", sygnatura: "S", sciezka: "domains/klient.pl/public_html/old.php" }],
  odrzucone: [], blad: null,
};
const WAF = {
  tryb: "ON", zastosowano: null, wToku: false, wczytano: "2026-10-10T10:00:00Z", razem: 2,
  trafienia: [{ czas: "2026-10-10T10:00:00Z", domena: "klient.pl", ip: "198.51.100.23", metoda: "POST", sciezka: "/wp-login.php", regula: "942100", opis: "SQL Injection", zablokowano: true, status: "403" }],
  reguly: [{ regula: "942100", opis: "SQL Injection", razy: 2, zablokowano: 2, ostatnio: "2026-10-10T10:00:00Z", domeny: ["klient.pl"] }],
  blad: null,
};

let root: Root;
let k: HTMLElement;
const op = (...permissions: string[]) => ({ isAdmin: false, permissions });
const render = async (dostep: { isAdmin: boolean; permissions: string[] }) => {
  await act(async () => {
    root.render(<BezpieczenstwoKontaPanel subscriptionId="s1" dostep={dostep} />);
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
const powod = () => k.querySelector<HTMLInputElement>('input[placeholder^="np. klient nie odbiera"]')!;
const L2 = op("IP_UNBLOCK", "ACCOUNT_DIAGNOSTICS_VIEW", "ACCOUNT_ACTIONS");

beforeEach(() => {
  odczyt.mockReset();
  zapis.mockReset();
  potwierdz.mockClear();
  odczyt.mockImplementation(async (_s: string, co: string) => ({ ok: true, wynik: co === "blokady-ip" ? IP : co === "malware" ? MALWARE : WAF }));
  zapis.mockImplementation(async (_s: string, co: string) => ({ ok: true, wynik: co.endsWith("-ip") ? IP : co === "wczytaj-waf" ? { ...WAF, wToku: true } : MALWARE }));
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

describe("F3.2 — bezpieczeństwo konta na karcie usługi", () => {
  it("L1 (bez uprawnień): nic nie czyta z serwera, w sekcjach nazwa brakującego uprawnienia", async () => {
    await render(op("CUSTOMERS_VIEW", "TICKETS_MANAGE"));
    expect(odczyt).not.toHaveBeenCalled();
    expect(k.textContent).toContain("Wymaga IP_UNBLOCK lub IP_BLOCKS_NODE");
    expect(k.textContent).toContain("Wymaga ACCOUNT_DIAGNOSTICS_VIEW");
    expect(q('[data-akcja="sprawdz-ip"]')).toBeNull();
  });

  it("„Zablokowało mi IP”: adresy klienta ze źródłem, wybór adresu, sprawdzenie, wynik z powodem blokady", async () => {
    await render(L2);
    expect(q('[data-adres="83.12.44.201"]')!.textContent).toContain("zgłoszenie #ab12cd34");
    expect(q('[data-adres="46.205.1.10"]')!.textContent).toContain("logowanie");
    await klik(q('[data-adres="83.12.44.201"]')!);
    expect(q('[data-sprawdzenie="83.12.44.201"]')!.textContent).toContain("nieudane logowania IMAP/POP3");
    await klik(q('[data-akcja="sprawdz-ip"]')!);
    expect(zapis).toHaveBeenCalledWith("s1", "sprawdz-ip", expect.objectContaining({ ip: "83.12.44.201" }));
  });

  it("odblokowanie: bez powodu wyszarzone; z powodem — potwierdzenie i zlecenie z numerem zgłoszenia", async () => {
    await render(L2);
    await klik(q('[data-adres="83.12.44.201"]')!);
    expect(q('[data-akcja="odblokuj-ip"]')!.disabled).toBe(true);
    await wpisz(powod(), "Klient nie odbiera poczty od rana");
    await wpisz(k.querySelector<HTMLInputElement>('input[placeholder="#ab12cd34"]')!, "#ab12cd34");
    await klik(q('[data-akcja="odblokuj-ip"]')!);
    expect(String(potwierdz.mock.calls[0]![0])).toContain("Odblokować adres 83.12.44.201");
    expect(zapis).toHaveBeenCalledWith("s1", "odblokuj-ip", { ip: "83.12.44.201", powod: "Klient nie odbiera poczty od rana", zgloszenie: "#ab12cd34" });
    expect(k.textContent).toContain("Odblokowanie zlecone");
  });

  it("kwarantanna: tylko zaznaczone pliki, lista w potwierdzeniu; anulowanie — nic; przywrócenie wpisu", async () => {
    await render(L2);
    await wpisz(powod(), "Backdoor w uploads, zgłoszenie abuse");
    expect(q('[data-akcja="kwarantanna"]')!.disabled).toBe(true);
    await klik(k.querySelector<HTMLInputElement>(`input[aria-label="Zaznacz ${PLIK}"]`)!);
    potwierdz.mockResolvedValueOnce(false);
    await klik(q('[data-akcja="kwarantanna"]')!);
    expect(zapis).not.toHaveBeenCalled();
    await klik(q('[data-akcja="kwarantanna"]')!);
    expect(String(potwierdz.mock.calls[1]![0])).toContain(PLIK);
    expect(String(potwierdz.mock.calls[1]![0])).toContain("kopie zostaną na koncie");
    expect(zapis).toHaveBeenCalledWith("s1", "kwarantanna", expect.objectContaining({ sciezki: [PLIK] }));
    await wpisz(powod(), "Fałszywy alarm — plik wtyczki");
    await klik(k.querySelector<HTMLInputElement>('input[aria-label="Zaznacz domains/klient.pl/public_html/old.php"]')!);
    await klik(q('[data-akcja="przywroc"]')!);
    expect(zapis).toHaveBeenLastCalledWith("s1", "przywroc", expect.objectContaining({ wpisy: [MALWARE.kwarantanna[0]!.id] }));
  });

  it("L2 bez ACCOUNT_ACTIONS (np. NOC): wyniki widać, ale bez zaznaczania i kwarantanny", async () => {
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW", "IP_BLOCKS_NODE"));
    expect(k.textContent).toContain(PLIK);
    expect(k.querySelector(`input[aria-label="Zaznacz ${PLIK}"]`)).toBeNull();
    expect(q('[data-akcja="kwarantanna"]')!.disabled).toBe(true);
    expect(q('[data-akcja="kwarantanna"]')!.title).toBe("Wymaga ACCOUNT_ACTIONS");
  });

  it("WAF: tryb do odczytu, najczęstsze reguły, wczytanie z serwera", async () => {
    await render(L2);
    expect(q('[data-tryb-waf="ON"]')!.textContent).toContain("blokuje (zmienia administrator)");
    expect(q('[data-waf="reguly"]')!.textContent).toContain("942100");
    await klik(q('[data-akcja="wczytaj-waf"]')!);
    expect(zapis).toHaveBeenCalledWith("s1", "wczytaj-waf", expect.anything());
    expect(q('[data-akcja="wczytaj-waf"]')!.textContent).toBe("Wczytywanie…");
  });
});
