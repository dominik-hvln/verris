/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * F2.6 — „Zasoby i diagnoza 508” na karcie usługi: faulty limitów (doba / 7 dni) z limitem, inody, 5xx i wolne SQL
 * obok siebie; brak raportu węzła to „—”, nie zera; L1 bez ACCOUNT_DIAGNOSTICS_VIEW nic nie czyta.
 */
const akcja = jest.fn();
jest.mock("./zasoby-konta-actions", () => ({ zasobyKontaAction: (...a: unknown[]) => akcja(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { ZasobyKontaPanel } from "./zasoby-konta-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const F0 = { cpu: 0, ep: 0, nproc: 0, pmem: 0, io: 0, iops: 0 };
const DANE = {
  login: "klient1",
  domena: "klient.pl",
  limity: { cpuProcent: 200, ep: 30, nproc: 100, ramMb: 2048, ioKbps: 10240, iops: 1024 },
  faulty: { odczytano: new Date().toISOString(), nieaktualne: false, blad: null, doba: { ...F0, ep: 25 }, tydzien: { ...F0, ep: 90, pmem: 3 } },
  inody: { uzyte: 240_000, limit: 250_000, blad: null },
  wolneSql: { wToku: false, odczytano: "2026-10-10T10:00:00.000Z", wlaczony: true, progSekund: 2, grupy: [{ sql: "SELECT * FROM wp_options WHERE autoload = ?", baza: "klient1_wp", liczba: 40, suma: 120, max: 6.5, przejrzane: 1e6, ostatnio: null }], blad: null },
  strona: { domena: "klient.pl", wToku: false, odczytano: "2026-10-10T10:00:00.000Z", statystyki: { ruch: [{ dzien: "2026-10-10", zadania: 1000, odwiedzajacy: 50, bledy5xx: 37 }], top5xx: [{ sciezka: "/wp-admin/admin-ajax.php", liczba: 30 }], ttfbMs: { mediana: 820, probki: 10 }, log: true }, blad: null },
};

let root: Root;
let k: HTMLElement;
const op = (...permissions: string[]) => ({ isAdmin: false, permissions });
const render = async (dostep: { isAdmin: boolean; permissions: string[] }) => {
  await act(async () => {
    root.render(<ZasobyKontaPanel subscriptionId="s1" dostep={dostep} />);
  });
};
const komorka = (zasob: string) => Array.from(k.querySelectorAll(`[data-zasob="${zasob}"] td`)).map((t) => t.textContent);

beforeEach(() => {
  akcja.mockReset();
  akcja.mockResolvedValue({ ok: true, wynik: DANE });
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

describe("F2.6 — zasoby i diagnoza 508 na karcie usługi", () => {
  it("L1 (bez ACCOUNT_DIAGNOSTICS_VIEW): nic nie czyta, informacja o brakującym uprawnieniu", async () => {
    await render(op("TICKETS_MANAGE", "CUSTOMERS_VIEW"));
    expect(akcja).not.toHaveBeenCalled();
    expect(k.querySelector("[data-zablokowane]")?.getAttribute("data-zablokowane")).toBe("Wymaga ACCOUNT_DIAGNOSTICS_VIEW");
    expect(k.querySelector('[data-akcja="wczytaj"]')).toBeNull();
  });

  it("L2: faulty z limitem, diagnoza EP → 508, inody, 5xx i wolne SQL obok siebie", async () => {
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    expect(akcja).toHaveBeenCalledWith("s1", false);
    expect(komorka("ep")).toEqual(["Procesy wejściowe (EP)", "30", "25", "90"]);
    expect(komorka("pmem")).toEqual(["Pamięć (PMEM)", "2048 MB", "0", "3"]);
    expect(k.querySelector("[data-diagnoza]")?.textContent).toContain("Procesy wejściowe (EP) — odwiedzający dostają błąd 508");
    expect(k.querySelector('[data-sekcja="inody"]')?.textContent).toContain("(96%)");
    expect(k.querySelector('[data-sekcja="5xx"]')?.textContent).toContain("37 z 1000 żądań");
    expect(k.querySelector('[data-sekcja="5xx"]')?.textContent).toContain("30× /wp-admin/admin-ajax.php");
    expect(k.querySelector('[data-sekcja="sql"]')?.textContent).toContain("40× · max 6,5 s");
    expect(k.querySelector("[data-raport]")?.getAttribute("data-raport")).toBe("ok");
  });

  it("brak raportu z węzła (stary agent): „—” zamiast zer i podpowiedź o redeployu agenta", async () => {
    akcja.mockResolvedValue({ ok: true, wynik: { ...DANE, faulty: { odczytano: null, nieaktualne: true, blad: null, doba: null, tydzien: null } } });
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    expect(komorka("ep")).toEqual(["Procesy wejściowe (EP)", "30", "—", "—"]);
    expect(k.querySelector("[data-diagnoza]")).toBeNull();
    expect(k.querySelector("[data-raport]")?.textContent).toContain("redeploy agenta");
  });

  it("doba bez odbić, 7 dni bez danych (raport ucięty): nie twierdzi, że w 7 dni było czysto", async () => {
    akcja.mockResolvedValue({ ok: true, wynik: { ...DANE, faulty: { ...DANE.faulty, doba: F0, tydzien: null } } });
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    expect(komorka("ep")).toEqual(["Procesy wejściowe (EP)", "30", "0", "—"]);
    const opis = k.querySelector("[data-diagnoza]")?.textContent ?? "";
    expect(opis).toContain("7 dni — brak danych");
    expect(opis).not.toContain("Bez przekroczeń");
  });

  it("audyt Fal 2: konto zawieszone (poza raportem węzła) — „—” i informacja, nie „Raport węzła … temu”", async () => {
    akcja.mockResolvedValue({ ok: true, wynik: { ...DANE, faulty: { ...DANE.faulty, doba: null, tydzien: null, pozaRaportem: true } } });
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    expect(komorka("ep")).toEqual(["Procesy wejściowe (EP)", "30", "—", "—"]);
    expect(k.querySelector("[data-diagnoza]")).toBeNull();
    expect(k.querySelector("[data-raport]")?.getAttribute("data-raport")).toBe("poza");
    expect(k.querySelector("[data-raport]")?.textContent).toContain("brak danych");
  });

  it("błąd narzędzia na węźle widoczny jako błąd; „Wczytaj” zleca odczyt z serwera", async () => {
    akcja.mockResolvedValueOnce({ ok: true, wynik: { ...DANE, faulty: { ...DANE.faulty, blad: "cloudlinux-statistics --period=1d: database is locked", doba: null, tydzien: null } } });
    await render({ isAdmin: true, permissions: [] });
    expect(k.querySelector("[data-raport]")?.getAttribute("data-raport")).toBe("crit");
    expect(k.querySelector("[data-raport]")?.textContent).toContain("database is locked");
    await act(async () => {
      k.querySelector<HTMLButtonElement>('[data-akcja="wczytaj"]')!.click();
    });
    expect(akcja).toHaveBeenLastCalledWith("s1", true);
  });

  it("odmowa API pokazana jako komunikat, bez pustej tabeli", async () => {
    akcja.mockResolvedValue({ ok: false, error: "Twoja rola nie ma uprawnienia „Podgląd konta klienta (ACCOUNT_DIAGNOSTICS_VIEW)”." });
    await render(op("ACCOUNT_DIAGNOSTICS_VIEW"));
    expect(k.querySelector('[role="alert"]')?.textContent).toContain("ACCOUNT_DIAGNOSTICS_VIEW");
    expect(k.querySelector('[data-sekcja="faulty"]')).toBeNull();
  });
});
