/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.1 reszta — nadawcy i odrzucenia węzła (bez adresów), link do karty usługi, RBL na żądanie z „nieznane” ≠ czysto. */
const akcja = jest.fn();
jest.mock("./poczta-wezla-actions", () => ({ pocztaWezlaAction: (...a: unknown[]) => akcja(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { PocztaWezlaPanel } from "./poczta-wezla-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const STAT = {
  wToku: false,
  kiedy: "2026-10-11T08:00:00.000Z",
  blad: null,
  wynik: {
    nadawcy: [
      { domena: "klient.pl", uzytkownik: "klient1", wiadomosci: 900, odrzucone: 400, opoznione: 3, konto: { subscriptionId: "s1", domena: "klient.pl", login: "klient1" } },
      { domena: "(zwrotki)", uzytkownik: null, wiadomosci: 12, odrzucone: 0, opoznione: 0, konto: null },
    ],
    odrzucenia: [{ kod: "550", serwer: "wp.pl", liczba: 380 }],
    okno: { od: "2026-10-10T00:00:01", do: "2026-10-11T07:59:00", wiadomosci: 912 },
  },
};

let root: Root;
let k: HTMLElement;
beforeEach(async () => {
  akcja.mockReset();
  akcja.mockImplementation(async (_id: string, co: string) =>
    co === "rbl" ? { ok: true, wynik: { ip: "203.0.113.7", sprawdzono: "2026-10-11T08:01:00.000Z", naLiscie: ["bl.spamcop.net"], nieznane: ["b.barracudacentral.org"], czyste: ["zen.spamhaus.org"] } } : { ok: true, wynik: STAT },
  );
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<PocztaWezlaPanel serverId="w1" />));
});
afterEach(() => act(() => root.unmount()));

it("nadawcy z linkiem do karty usługi, odrzucenia z kodem i serwerem, wysoki odsetek odrzuceń wyróżniony", () => {
  expect(akcja).toHaveBeenCalledWith("w1", "statystyki");
  const link = k.querySelector<HTMLAnchorElement>('a[href="/subscriptions/s1?sekcja=konto#poczta-konta"]');
  expect(link?.textContent).toBe("klient.pl");
  expect(k.textContent).toContain("(zwrotki)");
  expect(k.textContent).toContain("550 · wp.pl · 380");
  expect(k.querySelector(".text-crit")?.textContent).toBe("400");
});

it("RBL: lista, brak odpowiedzi i czysto osobno", async () => {
  await act(async () => k.querySelector<HTMLButtonElement>('[data-akcja="rbl"]')!.click());
  const rbl = k.querySelector("[data-rbl]")!.textContent!;
  expect(rbl).toContain("na liście: bl.spamcop.net");
  expect(rbl).toContain("brak odpowiedzi: b.barracudacentral.org");
  expect(rbl).toContain("czysto: zen.spamhaus.org");
});

it("wczytanie z serwera zleca zadanie", async () => {
  await act(async () => k.querySelector<HTMLButtonElement>('[data-akcja="wczytaj-statystyki"]')!.click());
  expect(akcja).toHaveBeenCalledWith("w1", "wczytaj");
});
