/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const pobierz = jest.fn();
const zapisz = jest.fn();
const tylko = jest.fn();
jest.mock("./kopie-offsite-actions", () => ({
  pobierzOffsiteWezla: (...a: unknown[]) => pobierz(...a),
  zapiszOffsiteWezla: (...a: unknown[]) => zapisz(...a),
  ustawTylkoPerWezel: (...a: unknown[]) => tylko(...a),
}));

import { KopieOffsiteWezla } from "./kopie-offsite-wezla";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Audyt 13.10 (#11) — własne dane kopii off-site węzła na karcie węzła (Konfiguracja, tylko admin). */
describe("KopieOffsiteWezla", () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(() => {
    pobierz.mockReset();
    zapisz.mockReset();
    tylko.mockReset();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  const wpisz = (etykieta: string, wartosc: string) => {
    const label = [...el.querySelectorAll("label")].find((l) => l.textContent?.startsWith(etykieta))!;
    const input = label.querySelector("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, wartosc);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const przycisk = (tekst: string) => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(tekst))!;

  it("węzeł na wspólnych danych: ostrzeżenie; zapis wysyła subkonta i wygenerowany crypt dopiero po potwierdzeniu sejfu", async () => {
    pobierz.mockResolvedValue({ ok: true, data: { wlasne: false, tylkoPerWezel: false } });
    zapisz.mockResolvedValue({ ok: true, data: { wlasne: true, tylkoPerWezel: false, host: "u1.your-storagebox.de", port: 23, user: "u1-sub1", sciezka: "", roUser: "u1-sub2", zmienionoAt: "2026-10-15T00:00:00Z" } });
    await act(async () => root.render(<KopieOffsiteWezla serverId="srv-1" />));
    expect(pobierz).toHaveBeenCalledWith("srv-1");
    expect(el.textContent).toContain("wspólne dla floty");

    await act(async () => {
      wpisz("Host Storage Boxa", "u1.your-storagebox.de");
      wpisz("Subkonto (zapis)", "u1-sub1");
      wpisz("Hasło subkonta (zapis)", "haslo-zapis");
      wpisz("Subkonto tylko do odczytu", "u1-sub2");
      wpisz("Hasło subkonta tylko do odczytu", "haslo-ro");
    });
    await act(async () => przycisk("Wygeneruj").click());
    expect((przycisk("Zapisz dane") as HTMLButtonElement).disabled).toBe(true);
    const sejf = [...el.querySelectorAll("label")].find((l) => l.textContent?.includes("menedżerze haseł"))!.querySelector("input")!;
    await act(async () => sejf.click());
    await act(async () => przycisk("Zapisz dane").click());

    expect(zapisz).toHaveBeenCalledTimes(1);
    const [id, dane] = zapisz.mock.calls[0] as [string, Record<string, string>];
    expect(id).toBe("srv-1");
    expect(dane).toMatchObject({ host: "u1.your-storagebox.de", port: 23, user: "u1-sub1", pass: "haslo-zapis", roUser: "u1-sub2", roPass: "haslo-ro" });
    expect(dane.cryptPass).toMatch(/^[0-9a-f]{48}$/);
    expect(dane.cryptSalt).toMatch(/^[0-9a-f]{48}$/);
    expect(el.textContent).toContain("własne (subkonto tego węzła)");
    expect(el.textContent).toContain("Onboard LIVE");
  });

  it("przełącznik floty „tylko per węzeł”", async () => {
    pobierz.mockResolvedValue({ ok: true, data: { wlasne: false, tylkoPerWezel: false } });
    tylko.mockResolvedValue({ ok: true, data: { tylkoPerWezel: true } });
    await act(async () => root.render(<KopieOffsiteWezla serverId="srv-1" />));
    const label = [...el.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Cała flota"))!;
    await act(async () => label.querySelector("input")!.click());
    expect(tylko).toHaveBeenCalledWith(true);
  });
});
