/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * F3.4 — usługi i logi węzła: watchdog, stan usług, restart z powodem; usługa wspólna — NOC uruchamia stojącą, działającą
 * restartuje administrator po przepisaniu nazwy węzła, zespół dostaje „Wyślij wniosek”; log z maską adresów.
 */
const akcja = jest.fn();
jest.mock("./uslugi-wezla-actions", () => ({ uslugiWezlaAction: (...a: unknown[]) => akcja(...a) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
const zapytaj = jest.fn(async (..._a: unknown[]): Promise<string | null> => "fra-01");
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a), zapytaj: (...a: unknown[]) => zapytaj(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));
jest.mock("@/components/wniosek-operacji", () => ({
  WyslijWniosek: (p: { typ: string; payload: Record<string, unknown> }) => <div data-wyslij-wniosek={p.typ}>{JSON.stringify(p.payload)}</div>,
}));

import { UslugiWezlaPanel } from "./uslugi-wezla-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const u = (klucz: string, etykieta: string, stan: string, przerwa: boolean, restart = true) => ({
  klucz, etykieta, przerwa, restart, jednostka: `${klucz}.service`, stan, activeState: stan === "dziala" ? "active" : "failed", od: null, restarty: 0,
});
const STAN = {
  wToku: { status: false, restart: false, log: false },
  uslugi: {
    kiedy: "2026-10-11T08:00:00Z",
    lista: [
      u("exim", "Poczta SMTP (Exim)", "dziala", true),
      u("dovecot", "Skrzynki IMAP/POP3 (Dovecot)", "blad", true),
      u("fail2ban", "Blokady IP (fail2ban)", "dziala", false),
      u("sshd", "SSH", "dziala", false, false),
    ],
  },
  bladStanu: null,
  restart: null,
  log: {
    klucz: "exim-main", etykieta: "Poczta — dziennik Exima", filtr: null, wToku: false, kiedy: "2026-10-11T08:01:00Z", zrodlo: "/var/log/exim/mainlog",
    dopasowanych: 2, pokazano: 2, maska: true, linie: ["<= •••@firma.pl", "=> •••@example.com"], blad: null,
  },
  watchdog: { kiedy: "2026-10-11T08:00:30Z", swiezy: true, nieDzialaja: ["dovecot"], uslugi: [] },
};

let root: Root;
let k: HTMLElement;
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
const montuj = async (isAdmin: boolean) => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<UslugiWezlaPanel serverId="w1" nazwaWezla="fra-01" isAdmin={isAdmin} />));
};

beforeEach(() => {
  akcja.mockReset();
  potwierdz.mockClear();
  zapytaj.mockClear();
  akcja.mockResolvedValue({ ok: true, wynik: STAN });
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("watchdog, stan usług i log z informacją o masce; usługa tylko do podglądu bez przycisku", async () => {
  await montuj(false);
  expect(akcja).toHaveBeenCalledWith("w1", "stan");
  expect(q('[data-watchdog="alarm"]')!.textContent).toContain("Skrzynki IMAP/POP3 (Dovecot)");
  expect(q('[data-usluga="dovecot"]')!.textContent).toContain("padła");
  expect(q('[data-akcja="restart-sshd"]')).toBeNull();
  expect(q('[data-log="exim-main"]')!.textContent).toContain("adresy e-mail zamaskowane");
  expect(q("pre")!.textContent).toContain("•••@firma.pl");
});

it("NOC: restart pomocniczej i uruchomienie stojącej wspólnej — z powodem i potwierdzeniem; działająca wspólna — wniosek, bez API", async () => {
  await montuj(false);
  expect(q('[data-akcja="restart-fail2ban"]')!.disabled).toBe(true);
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Powód restartu"]')!, "fail2ban nie zdejmuje blokad");
  await klik(q('[data-akcja="restart-fail2ban"]')!);
  expect(akcja).toHaveBeenLastCalledWith("w1", "restart", { usluga: "fail2ban", powod: "fail2ban nie zdejmuje blokad" });
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Powód restartu"]')!, "dovecot padł po aktualizacji");
  expect(q('[data-akcja="restart-dovecot"]')!.textContent).toBe("Uruchom");
  await klik(q('[data-akcja="restart-dovecot"]')!);
  expect(akcja).toHaveBeenLastCalledWith("w1", "restart", { usluga: "dovecot", powod: "dovecot padł po aktualizacji" });
  const wywolan = akcja.mock.calls.length;
  expect(q('[data-akcja="restart-exim"]')!.textContent).toBe("Wniosek o restart");
  await klik(q('[data-akcja="restart-exim"]')!);
  expect(akcja.mock.calls.length).toBe(wywolan);
  expect(q('[data-wyslij-wniosek="NODE_SERVICE_RESTART"]')!.textContent).toBe(JSON.stringify({ serverId: "w1", usluga: "exim" }));
});

it("ADMIN: działająca usługa wspólna — przepisanie nazwy węzła, restart-wspolnej; anulowanie — nic", async () => {
  await montuj(true);
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Powód restartu"]')!, "kolejka poczty stoi od godziny");
  zapytaj.mockResolvedValueOnce(null);
  await klik(q('[data-akcja="restart-exim"]')!);
  expect(akcja.mock.calls.filter((c) => c[1] === "restart-wspolnej")).toEqual([]);
  await klik(q('[data-akcja="restart-exim"]')!);
  expect(akcja).toHaveBeenLastCalledWith("w1", "restart-wspolnej", { usluga: "exim", powod: "kolejka poczty stoi od godziny", potwierdzenie: "fra-01" });
  expect(q('[data-wyslij-wniosek]')).toBeNull();
});

it("log: wybrany log, liczba linii w granicach 20–500, filtr", async () => {
  await montuj(false);
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Ile ostatnich linii"]')!, "9999");
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Filtr logu"]')!, "1abc");
  await klik(q('[data-akcja="log"]')!);
  expect(akcja).toHaveBeenLastCalledWith("w1", "log", { log: "system", linie: 500, filtr: "1abc" });
});

describe("poprawka 12.10 — świeży watchdog a migawka z „Sprawdź na serwerze”", () => {
  const STARA = {
    ...STAN,
    uslugi: {
      kiedy: "2026-10-11T12:00:00Z",
      lista: [u("ftp", "FTP", "dziala", true), u("dovecot", "Skrzynki IMAP/POP3 (Dovecot)", "blad", true), u("exim", "Poczta SMTP (Exim)", "dziala", true)],
    },
    watchdog: {
      kiedy: "2026-10-12T12:05:00Z",
      swiezy: true,
      nieDzialaja: ["ftp"],
      uslugi: [
        { k: "ftp", s: "failed", e: "enabled" },
        { k: "dovecot", s: "active", e: "enabled" },
        { k: "exim", s: "active", e: "enabled" },
      ],
    },
  };

  it("wiersz pokazuje stan z watchdoga, migawka oznaczona jako starsza, przycisk wg stanu z watchdoga", async () => {
    akcja.mockResolvedValue({ ok: true, wynik: STARA });
    await montuj(false);
    const ftp = q('[data-usluga="ftp"]')!;
    expect(ftp.textContent).toContain("nie działa — wg watchdoga 14:05");
    expect(ftp.textContent).not.toContain("działa od");
    expect(ftp.querySelector("td[title]")!.getAttribute("title")).toBe("Migawka z 14:00 11.10: działa");
    expect(q('[data-usluga="dovecot"]')!.textContent).toContain("działa — wg watchdoga 14:05");
    expect(q('[data-usluga="exim"]')!.textContent).toContain("działa");
    expect(q('[data-usluga="exim"]')!.textContent).not.toContain("wg watchdoga");
    expect(q('[data-migawka="starsza"]')!.textContent).toBe(
      "Szczegóły z 14:00 11.10 (działa od, restarty) — starsze niż watchdog; odśwież „Sprawdź na serwerze”.",
    );
    // FTP stoi wg watchdoga — NOC może go uruchomić (serwer i tak sprawdza stan w chwili wykonania).
    expect(q('[data-akcja="restart-ftp"]')!.textContent).toBe("Uruchom");
  });

  it("migawka nowsza od raportu albo raport nieświeży — tabela bez zmian, bez oznaczenia", async () => {
    akcja.mockResolvedValue({ ok: true, wynik: { ...STARA, uslugi: { ...STARA.uslugi, kiedy: "2026-10-12T12:06:00Z" } } });
    await montuj(false);
    expect(q('[data-usluga="ftp"]')!.textContent).not.toContain("wg watchdoga");
    expect(q('[data-migawka="starsza"]')).toBeNull();
    await act(async () => root.unmount());
    k.remove();

    akcja.mockResolvedValue({ ok: true, wynik: { ...STARA, watchdog: { ...STARA.watchdog, swiezy: false, nieDzialaja: [] } } });
    await montuj(false);
    expect(q('[data-usluga="ftp"]')!.textContent).not.toContain("wg watchdoga");
    expect(q('[data-migawka="starsza"]')).toBeNull();
  });
});
