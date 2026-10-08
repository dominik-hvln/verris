import { renderToStaticMarkup } from "react-dom/server";

/** PB-45 — formularz „Migracja za klienta”: prostszy od kreatora klienta, puste wiersze nie idą do API. */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("../actions", () => ({ testDostepowZaKlientaAction: jest.fn(), utworzMigracjeZaKlientaAction: jest.fn() }));

import { FormularzZaKlienta, zbudujZlecenie } from "./formularz-za-klienta";

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

describe("zbudujZlecenie", () => {
  it("bez hosta FTP i bez wierszy — tylko usługa i powód (API odpowie „wskaż źródło”)", () => {
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

  it("domyślne porty, pusty katalog = /, bazy bez loginu (odczyt z wp-config), puste wiersze pominięte", () => {
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
    expect(zbudujZlecenie(wejscie({ protokol: "sftp", ftp: { host: "h", port: "", username: "u", password: "p", remotePath: "/www" } })).ftp?.port).toBe(22);
  });

  it("„załóż brakujące skrzynki” bez żadnej skrzynki nie idzie do API", () => {
    expect(zbudujZlecenie(wejscie({ zalozSkrzynki: true })).utworzBrakujaceSkrzynki).toBeUndefined();
  });
});

it("formularz pokazuje klienta, wymaga powodu i nie ma przycisku zgody (zgodę daje tylko klient)", () => {
  const html = renderToStaticMarkup(
    <FormularzZaKlienta subscriptionId="sub-1" klient="Anna Nowak" email="anna@test.pl" domenaKonta="sklep.example.pl" />,
  );
  const tekst = html.replace(/<[^>]+>/g, " ");
  expect(tekst).toContain("Anna Nowak");
  expect(tekst).toContain("Powód / numer zgłoszenia");
  expect(tekst).toContain("Test dostępów");
  expect(tekst).toContain("Wyślij klientowi prośbę o zgodę");
  expect(tekst).not.toMatch(/upoważniam|zgoda RODO/i);
});
