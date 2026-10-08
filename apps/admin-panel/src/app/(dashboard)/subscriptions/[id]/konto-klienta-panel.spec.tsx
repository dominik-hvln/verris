/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * PB-42 — interakcja karty „Konto klienta” (ten sam plik panelu jest w staff — pilnuje tego
 * staff-panel/…/konto-klienta-panel-zgodnosc.spec.ts): klik zakładki woła akcję raz, wynik zostaje
 * w pamięci (drugi klik nie czyta serwera ani nie robi drugiego wpisu w dzienniku), w trakcie ładowania
 * przyciski są zablokowane, błąd akcji — także jej odrzucenie — to alert w sekcji, a nie wywrócona karta.
 */
const wczytaj = jest.fn();
const zlec = jest.fn();
jest.mock("./konto-klienta-actions", () => ({
  wczytajSekcjeKontaAction: (...a: unknown[]) => wczytaj(...a),
  zlecDziennikPocztyAction: (...a: unknown[]) => zlec(...a),
}));

import { KontoKlientaPanel } from "./konto-klienta-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;

const DNS = {
  ok: true,
  wynik: {
    sekcja: "dns",
    dane: { domeny: ["klient.pl"], domain: "klient.pl", records: [{ id: "1", name: "klient.pl.", type: "A", value: "203.0.113.5", ttl: 3600 }], fetchError: null },
  },
};

function odroczona<T>() {
  let rozwiaz!: (v: T) => void;
  let odrzuc!: (e: unknown) => void;
  const obietnica = new Promise<T>((res, rej) => {
    rozwiaz = res;
    odrzuc = rej;
  });
  return { obietnica, rozwiaz, odrzuc };
}

const przycisk = (napis: string) => {
  const b = [...k.querySelectorAll("button")].find((x) => x.textContent?.trim() === napis);
  if (!b) throw new Error(`Brak przycisku „${napis}”`);
  return b;
};
const klik = async (napis: string) => {
  await act(async () => {
    przycisk(napis).click();
  });
};

beforeEach(() => {
  wczytaj.mockReset();
  zlec.mockReset();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  act(() => root.render(<KontoKlientaPanel subscriptionId="s1" />));
});
afterEach(() => {
  act(() => root.unmount());
  k.remove();
});

describe("PB-42 KontoKlientaPanel — interakcja", () => {
  it("klik „DNS” woła akcję raz z ('s1','dns',{}), pokazuje rekordy; ponowne otwarcie bez drugiego odczytu", async () => {
    wczytaj.mockResolvedValueOnce(DNS);
    await klik("DNS");
    expect(wczytaj).toHaveBeenCalledTimes(1);
    expect(wczytaj).toHaveBeenCalledWith("s1", "dns", {});
    expect(k.textContent).toContain("203.0.113.5");

    wczytaj.mockResolvedValueOnce({ ok: true, wynik: { sekcja: "bazy", dane: { bazy: ["u1_wp"], silnik: null, fetchError: null } } });
    await klik("Bazy danych");
    await klik("DNS");
    expect(wczytaj).toHaveBeenCalledTimes(2);
    expect(wczytaj.mock.calls.map((c) => c[1])).toEqual(["dns", "bazy"]);
    expect(k.textContent).toContain("203.0.113.5");
  });

  it("w trakcie ładowania zakładki i „Odśwież” są zablokowane", async () => {
    const d = odroczona<typeof DNS>();
    wczytaj.mockReturnValueOnce(d.obietnica);
    await klik("DNS");
    expect(przycisk("Poczta").disabled).toBe(true);
    expect(przycisk("Wczytuję…").disabled).toBe(true);
    await act(async () => d.rozwiaz(DNS));
    expect(przycisk("Poczta").disabled).toBe(false);
    expect(przycisk("Odśwież").disabled).toBe(false);
  });

  it("błąd z akcji → alert z komunikatem", async () => {
    wczytaj.mockResolvedValueOnce({ ok: false, error: "Usługa nie ma konta hostingowego." });
    await klik("Cron");
    const alert = k.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Usługa nie ma konta hostingowego.");
  });

  it("odrzucona akcja (np. zerwane połączenie) → alert w sekcji, karta działa dalej", async () => {
    wczytaj.mockRejectedValueOnce(new Error("fetch failed"));
    await klik("SSL");
    expect(k.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się połączyć z panelem");
    expect(przycisk("DNS").disabled).toBe(false);
  });

  it("logi poczty: „Wczytaj z serwera” zleca odczyt z adresem i pokazuje stan „w toku”", async () => {
    wczytaj.mockResolvedValueOnce({ ok: true, wynik: { sekcja: "logi-poczty", dane: { wToku: false, wczytano: null, adres: null, wpisy: [], blad: null } } });
    await klik("Logi poczty");
    const pole = k.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, "jan@klient.pl");
      pole.dispatchEvent(new Event("input", { bubbles: true }));
    });
    zlec.mockResolvedValueOnce({ ok: true, wynik: { sekcja: "logi-poczty", dane: { wToku: true, wczytano: null, adres: null, wpisy: [], blad: null } } });
    await klik("Wczytaj z serwera");
    expect(zlec).toHaveBeenCalledWith("s1", "jan@klient.pl");
    expect(k.textContent).toContain("w toku");
  });
});
