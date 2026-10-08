/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * ADMIN-MIGR — formularz „Migracja za klienta” w panelu admina: te same pola co w panelu obsługi (PB-45),
 * puste wiersze nie idą do API, bez powodu nie da się wysłać prośby, po wysłaniu — informacja i link do szczegółów.
 */
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("../actions", () => ({ testDostepowZaKlientaAction: jest.fn(), utworzMigracjeZaKlientaAction: jest.fn() }));

import { testDostepowZaKlientaAction, utworzMigracjeZaKlientaAction } from "../actions";
import { FormularzZaKlienta, zbudujZlecenie } from "./formularz-za-klienta";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const utworz = utworzMigracjeZaKlientaAction as jest.Mock;
const testuj = testDostepowZaKlientaAction as jest.Mock;

const baza = { host: "", port: "", database: "", username: "", password: "" };
const wejscie = (z: Partial<Parameters<typeof zbudujZlecenie>[0]> = {}): Parameters<typeof zbudujZlecenie>[0] => ({
  subscriptionId: "sub-1",
  powod: "  Zgłoszenie #1234  ",
  ticketId: "",
  targetDomain: "",
  sourceDomain: "",
  notes: "",
  protokol: "sftp",
  ftp: { host: "", port: "", username: "", password: "", remotePath: "" },
  bazy: [],
  skrzynki: [],
  zalozSkrzynki: true,
  ...z,
});

describe("zbudujZlecenie (admin)", () => {
  it("bez hosta FTP i bez wierszy — tylko usługa i powód", () => {
    expect(zbudujZlecenie(wejscie())).toEqual({
      subscriptionId: "sub-1",
      powod: "Zgłoszenie #1234",
      ticketId: undefined,
      targetDomain: undefined,
      sourceDomain: undefined,
      notes: undefined,
      ftp: undefined,
      mysql: undefined,
      imap: undefined,
      utworzBrakujaceSkrzynki: undefined,
    });
  });

  it("domyślne porty, pusty katalog = /, bazy bez loginu, puste wiersze pominięte", () => {
    const z = zbudujZlecenie(
      wejscie({
        protokol: "ftp",
        ftp: { host: " ftp.stary.pl ", port: "", username: "sklep", password: "p@ss", remotePath: "" },
        bazy: [{ ...baza, host: "mysql.stary.pl", database: "sklep_db" }, baza],
        skrzynki: [{ email: " Biuro@Sklep.pl ", host: "imap.stary.pl", password: "x" }, { email: "", host: "", password: "" }],
      }),
    );
    expect(z.ftp).toEqual({ protocol: "ftp", host: "ftp.stary.pl", port: 21, username: "sklep", password: "p@ss", remotePath: "/" });
    expect(z.mysql).toEqual([{ host: "mysql.stary.pl", port: 3306, database: "sklep_db", username: undefined, password: undefined }]);
    expect(z.imap).toEqual([{ email: "biuro@sklep.pl", host: "imap.stary.pl", password: "x" }]);
    expect(z.utworzBrakujaceSkrzynki).toBe(true);
  });
});

describe("bliźniak formularza z panelu obsługi", () => {
  const KORZEN = join(__dirname, "..", "..", "..", "..", "..", "..");
  const staff = (p: string) => readFileSync(join(KORZEN, "staff-panel", "src", "app", "(dashboard)", "migrations", p), "utf8");
  const admin = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  const funkcja = (src: string) => src.slice(src.indexOf("export function zbudujZlecenie"), src.indexOf("export function FormularzZaKlienta"));
  const typ = (src: string, nazwa: string) => {
    const od = src.indexOf(`export interface ${nazwa}`);
    return src.slice(od, src.indexOf("\n}\n", od));
  };

  it("zbudujZlecenie jest identyczne — oba panele wysyłają te same pola", () => {
    const a = funkcja(admin("za-klienta/formularz-za-klienta.tsx"));
    expect(a.length).toBeGreaterThan(200);
    expect(a).toBe(funkcja(staff("za-klienta/formularz-za-klienta.tsx")));
  });

  it("typy zlecenia i testu dostępów są identyczne w akcjach obu paneli", () => {
    for (const nazwa of ["MigracjaZaKlientaInput", "PreflightZaKlienta"]) {
      const a = typ(admin("actions.ts"), nazwa);
      expect(a.length).toBeGreaterThan(30);
      expect(a).toBe(typ(staff("actions.ts"), nazwa));
    }
  });
});

describe("formularz w przeglądarce", () => {
  let root: Root;
  let k: HTMLElement;

  beforeEach(() => {
    utworz.mockReset();
    testuj.mockReset();
    k = document.createElement("div");
    document.body.appendChild(k);
    root = createRoot(k);
    act(() => root.render(<FormularzZaKlienta subscriptionId="sub-1" klient="Anna Nowak" email="anna@test.pl" domenaKonta="sklep.example.pl" />));
  });
  afterEach(() => {
    act(() => root.unmount());
    k.remove();
  });

  const przycisk = (t: string) => [...k.querySelectorAll("button")].find((b) => b.textContent === t) as HTMLButtonElement;
  const poleZEtykieta = (t: string) =>
    [...k.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent?.startsWith(t))!.querySelector("input")!;
  function wpisz(el: HTMLInputElement, v: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("pokazuje klienta i nie ma przycisku zgody (zgodę daje tylko klient)", () => {
    expect(k.textContent).toContain("Anna Nowak");
    expect(k.textContent).toContain("sklep.example.pl");
    expect(k.textContent).not.toMatch(/upoważniam|zgoda RODO/i);
  });

  it("bez źródła i bez powodu (min. 5 znaków) nie da się wysłać prośby", () => {
    const wyslij = przycisk("Wyślij klientowi prośbę o zgodę");
    expect(wyslij.disabled).toBe(true);
    wpisz(poleZEtykieta("Host"), "ftp.stary.pl");
    expect(wyslij.disabled).toBe(true);
    wpisz(poleZEtykieta("Powód"), "abcd");
    expect(wyslij.disabled).toBe(true);
    wpisz(poleZEtykieta("Powód"), "Zgłoszenie #77");
    expect(wyslij.disabled).toBe(false);
  });

  it("wysyła pola zlecenia, po sukcesie mówi o prośbie o zgodę i linkuje szczegóły migracji", async () => {
    utworz.mockResolvedValue({ ok: true, id: "mig-9", wygasa: "2026-10-15T10:00:00.000Z", mailWyslany: true });
    wpisz(poleZEtykieta("Host"), " ftp.stary.pl ");
    wpisz(poleZEtykieta("Użytkownik"), "sklep");
    wpisz(poleZEtykieta("Hasło"), "tajne");
    wpisz(poleZEtykieta("Powód"), "Zgłoszenie #77 — przeniesienie");
    await act(async () => przycisk("Wyślij klientowi prośbę o zgodę").click());
    expect(utworz).toHaveBeenCalledWith({
      subscriptionId: "sub-1",
      powod: "Zgłoszenie #77 — przeniesienie",
      ticketId: undefined,
      targetDomain: undefined,
      sourceDomain: undefined,
      notes: undefined,
      ftp: { protocol: "sftp", host: "ftp.stary.pl", port: 22, username: "sklep", password: "tajne", remotePath: "/" },
      mysql: undefined,
      imap: undefined,
      utworzBrakujaceSkrzynki: undefined,
    });
    expect(k.textContent).toContain("Prośba o zgodę wysłana do klienta.");
    expect(k.textContent).toContain("E-mail poszedł na anna@test.pl.");
    expect(k.querySelector('a[href="/migrations/mig-9"]')?.textContent).toBe("Szczegóły zlecenia");
  });

  it("błąd API → czytelny komunikat, formularz zostaje", async () => {
    utworz.mockResolvedValue({ error: "Ta usługa ma już migrację w toku." });
    wpisz(poleZEtykieta("Host"), "ftp.stary.pl");
    wpisz(poleZEtykieta("Powód"), "Zgłoszenie #77");
    await act(async () => przycisk("Wyślij klientowi prośbę o zgodę").click());
    expect(k.textContent).toContain("Ta usługa ma już migrację w toku.");
    expect(przycisk("Test dostępów")).toBeTruthy();
  });

  it("test dostępów: wynik z odmianą liczebnika", async () => {
    testuj.mockResolvedValue({
      ok: true,
      wynik: {
        ok: false,
        checks: [
          { kind: "ftp", target: "ftp.stary.pl", status: "auth_failed", message: "Złe hasło" },
          { kind: "mysql", target: "sklep_db", status: "unreachable", message: "Brak połączenia" },
        ],
      },
    });
    wpisz(poleZEtykieta("Host"), "ftp.stary.pl");
    await act(async () => przycisk("Test dostępów").click());
    expect(testuj).toHaveBeenCalledTimes(1);
    expect(k.textContent).toContain("2 źródła wymagają poprawy.");
    expect(k.textContent).toContain("ftp.stary.pl: Złe hasło");
  });
});
