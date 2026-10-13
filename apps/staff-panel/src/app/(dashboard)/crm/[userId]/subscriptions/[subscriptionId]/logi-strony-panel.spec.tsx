/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 14.10 — „Logi strony” w panelu obsługi: zestawy dla konta (ruch i błędy strony, poczta domeny, FTP/SSH konta),
 * zamówienie odczytu przez API logów węzła, wynik z zakresem okna, ostrzeżenie przy agencie sprzed 14.10.
 */
const akcja = jest.fn();
jest.mock("./logi-strony-actions", () => ({ logiStronyAction: (...a: unknown[]) => akcja(...a) }));

import { LogiStronyPanel, odDlaZakresu, zestawyDlaKonta } from "./logi-strony-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const WYNIK = {
  wToku: { log: false },
  log: {
    klucz: "www-domena", etykieta: "Strona — ruch (access log domeny)", filtr: null, domena: "firma.pl", uzytkownik: null, od: null, do: null,
    wToku: false, kiedy: "2026-10-14T08:00:00Z", zrodlo: "/var/log/httpd/domains/firma.pl.log", dopasowanych: 1, pokazano: 1, maska: true,
    linie: ['203.0.113.••• - - [14/Oct/2026:10:00:00 +0200] "GET / HTTP/1.1" 200'],
    zakres: { od: "2026-10-14T06:00:00.000Z", do: "2026-10-14T08:00:00.000Z" }, zastosowane: ["domena"], blad: null,
  },
};

let root: Root | null = null;
let k: HTMLElement | null = null;
const montuj = async (domena: string | null = "firma.pl", daUser: string | null = "firma1") => {
  k = document.createElement("div");
  document.body.appendChild(k);
  const r = createRoot(k);
  root = r;
  await act(async () => r.render(<LogiStronyPanel serverId="n1" domena={domena} daUser={daUser} />));
};

beforeEach(() => {
  akcja.mockReset();
  akcja.mockResolvedValue({ ok: true, wynik: WYNIK });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  k?.remove();
  root = null;
  k = null;
});

it("zestawy: domena i użytkownik konta tylko poprawne; bez nich — brak zestawów", () => {
  expect(zestawyDlaKonta("Firma.pl", "firma1").map((z) => [z.log, z.domena ?? z.uzytkownik])).toEqual([
    ["www-domena", "firma.pl"],
    ["www-domena-bledy", "firma.pl"],
    ["exim-main", "firma.pl"],
    ["maillog", "firma.pl"],
    ["ftp-pureftpd", "firma1"],
    ["ssh", "firma1"],
  ]);
  expect(zestawyDlaKonta("../etc", "a b")).toEqual([]);
});

it("pierwszy zestaw (ruch strony) idzie do API z domeną konta; wynik z zakresem okna i maską", async () => {
  await montuj();
  expect(akcja).toHaveBeenCalledWith("n1", "stan");
  await act(async () => {
    k!.querySelector<HTMLButtonElement>('[data-akcja="pokaz-log"]')!.click();
  });
  expect(akcja).toHaveBeenLastCalledWith("n1", "log", {
    log: "www-domena", linie: 200, filtr: "", domena: "firma.pl", uzytkownik: undefined, od: expect.any(String),
  });
  // domyślnie ostatnie 24 h
  const od = Date.parse((akcja.mock.calls.at(-1)![2] as { od: string }).od);
  expect(Math.abs(Date.now() - 24 * 3600_000 - od)).toBeLessThan(60_000);
  expect(odDlaZakresu("", Date.parse("2026-10-14T10:00:00Z"))).toBeUndefined();
  expect(odDlaZakresu("1h", Date.parse("2026-10-14T10:00:00Z"))).toBe("2026-10-14T09:00:00.000Z");
  expect(k!.querySelector('[data-log="www-domena"]')!.textContent).toContain("domena firma.pl");
  expect(k!.textContent).toContain("Przeszukano wpisy od 14.10, 08:00 do 14.10, 10:00");
  expect(k!.querySelector("pre")!.textContent).toContain("203.0.113.•••");
  expect(k!.querySelector('[data-filtry="stary-agent"]')).toBeNull();
});

it("agent sprzed 14.10 (bez raportu filtrów) — ostrzeżenie, że filtry nie zadziałały", async () => {
  akcja.mockResolvedValue({ ok: true, wynik: { ...WYNIK, log: { ...WYNIK.log, zastosowane: null, zakres: null } } });
  await montuj();
  expect(k!.querySelector('[data-filtry="stary-agent"]')!.textContent).toContain("nie zadziałały");
});

it("konto bez poprawnej domeny i użytkownika — panelu nie ma", async () => {
  await montuj(null, null);
  expect(k!.querySelector("[data-logi-strony]")).toBeNull();
});
