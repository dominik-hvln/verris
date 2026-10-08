import { renderToStaticMarkup } from "react-dom/server";

/**
 * PB-42 — sekcje konta klienta w karcie usługi (obsługa): render danych z serwera, komunikat zamiast pustki
 * przy awarii węzła, błąd uprawnień jako czytelny tekst, brak wołania serwera przy samym wejściu na kartę.
 */
class StaffApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
const staffApi = jest.fn();
jest.mock("@/lib/staff-api", () => ({ staffApi: (...a: unknown[]) => staffApi(...a), StaffApiError }));

import { KontoKlientaPanel } from "./konto-klienta-panel";
import { wczytajSekcjeKontaAction, zlecDziennikPocztyAction } from "./konto-klienta-actions";
import { BladSekcji, WidokSekcjiKonta, type DaneSekcji } from "./konto-klienta-widok";

const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const widok = (w: DaneSekcji) => tekst(renderToStaticMarkup(<WidokSekcjiKonta wynik={w} />));

beforeEach(() => staffApi.mockReset());

describe("PB-42 karta usługi — konto klienta (staff)", () => {
  it("wejście na kartę pokazuje zakładki i nie woła serwera", () => {
    const html = tekst(renderToStaticMarkup(<KontoKlientaPanel subscriptionId="s1" />));
    for (const z of ["Domeny", "DNS", "Poczta", "Bazy danych", "PHP", "SSL", "Cron", "Logi WWW", "Logi poczty"]) expect(html).toContain(z);
    expect(staffApi).not.toHaveBeenCalled();
  });

  it("DNS: rekordy strefy z odmianą liczebnika", () => {
    const html = widok({
      sekcja: "dns",
      dane: {
        domeny: ["klient.pl"],
        domain: "klient.pl",
        records: [
          { id: "1", name: "klient.pl.", type: "A", value: "203.0.113.5", ttl: 3600 },
          { id: "2", name: "klient.pl.", type: "MX", value: "10 mail.klient.pl.", ttl: null },
        ],
        fetchError: null,
      },
    });
    expect(html).toContain("Strefa klient.pl: 2 rekordy");
    expect(html).toContain("203.0.113.5");
    expect(html).toContain("10 mail.klient.pl.");
  });

  it("awaria węzła: komunikat zamiast pustej listy", () => {
    const html = widok({ sekcja: "cron", dane: { rows: [], fetchError: "Serwer hostingowy jest chwilowo niedostępny." } });
    expect(html).toContain("Odczyt z serwera nie powiódł się: Serwer hostingowy jest chwilowo niedostępny.");
    expect(html).not.toContain("Brak zadań cron.");
  });

  it("poczta, bazy, SSL, PHP, logi — dane z odpowiedzi", () => {
    expect(
      widok({
        sekcja: "poczta",
        dane: { skrzynki: [{ email: "jan@klient.pl", quotaMb: 1024 }], przekierowania: [{ email: "biuro@klient.pl", destinations: ["jan@klient.pl", "ola@klient.pl"] }], fetchError: null },
      }),
    ).toContain("1 skrzynka, 1 przekierowanie");
    expect(widok({ sekcja: "bazy", dane: { bazy: ["u1_wp", "u1_sklep"], silnik: { name: "MariaDB", version: "10.11" }, fetchError: null } })).toContain(
      "2 bazy · MariaDB 10.11",
    );
    expect(
      widok({
        sekcja: "ssl",
        dane: { rows: [{ domain: "klient.pl", issuer: "Let's Encrypt", status: "EXPIRING", expiresAt: "2026-10-20T00:00:00Z", daysLeft: 5, isLetsEncrypt: true }], fetchError: null },
      }),
    ).toContain("wkrótce wygasa");
    const php = widok({
      sekcja: "php",
      dane: {
        wersja: "8.3",
        dostepneWersje: ["8.3"],
        zastosowano: null,
        ostatnieZadanie: { status: "FAILED", errorMessage: "wersja niedostępna", createdAt: "2026-10-08T10:00:00Z", completedAt: null },
        domeny: ["klient.pl"],
        domena: "klient.pl",
        ini: null,
        wlasneDyrektywy: null,
        iniBlad: "Serwer hostingowy jest chwilowo niedostępny.",
      },
    });
    expect(php).toContain("Wersja PHP konta: 8.3");
    expect(php).toContain("nieudana");
    expect(php).toContain("Odczyt z serwera nie powiódł się");
    const logi = widok({ sekcja: "logi", dane: { domeny: ["klient.pl"], domain: "klient.pl", type: "error", lines: ["PHP Fatal error: x"], truncated: false, fetchError: null } });
    expect(logi).toContain("Log błędów klient.pl: 1 linia");
    expect(logi).toContain("PHP Fatal error: x");
  });

  it("logi poczty bez wczytanego dziennika — wyjaśnienie zamiast pustej tabeli; wczytanie robi obsługa, nie klient", () => {
    const html = widok({ sekcja: "logi-poczty", dane: { wToku: false, wczytano: null, adres: null, wpisy: [], blad: null } });
    expect(html).toContain("Dziennik poczty nie był jeszcze wczytany");
    expect(html).toContain("Wczytaj z serwera");
    expect(html).not.toContain("zleca klient");
    expect(widok({ sekcja: "logi-poczty", dane: { wToku: true, wczytano: null, adres: null, wpisy: [], blad: null } })).toContain("w toku");
  });

  it("błąd sekcji renderuje się jako alert", () => {
    expect(renderToStaticMarkup(<BladSekcji komunikat="Usługa nie ma konta hostingowego." />)).toContain('role="alert"');
  });

  it("akcja: właściwy adres API, parametry logów i czytelny komunikat przy braku uprawnienia", async () => {
    staffApi.mockResolvedValueOnce({ rows: [], fetchError: null });
    const ok = await wczytajSekcjeKontaAction("s1", "logi", { type: "access", domain: "klient.pl", lines: 500 });
    expect(staffApi).toHaveBeenCalledWith("/admin/subscriptions/s1/konto/logi?domain=klient.pl&type=access&lines=500");
    expect(ok.ok).toBe(true);

    staffApi.mockRejectedValueOnce(new StaffApiError("Twoja rola nie ma uprawnień do tej operacji.", 403));
    const brak = await wczytajSekcjeKontaAction("s1", "dns");
    expect(brak).toEqual({ ok: false, error: expect.stringContaining("Podgląd konta klienta") });

    staffApi.mockRejectedValueOnce(new StaffApiError("Usługa nie istnieje.", 404));
    expect(await wczytajSekcjeKontaAction("s1", "bazy")).toEqual({ ok: false, error: "Usługa nie istnieje." });

    expect(await wczytajSekcjeKontaAction("s1", "../users" as never)).toEqual({ ok: false, error: "Nieznana sekcja konta." });
  });

  it("akcja: zlecenie świeżego dziennika poczty — POST z opcjonalnym adresem, konflikt jako komunikat", async () => {
    staffApi.mockResolvedValueOnce({ wToku: true, wczytano: null, adres: null, wpisy: [], blad: null });
    const ok = await zlecDziennikPocztyAction("s1", " jan@klient.pl ");
    expect(staffApi).toHaveBeenCalledWith("/admin/subscriptions/s1/konto/logi-poczty", { method: "POST", body: { address: "jan@klient.pl" } });
    expect(ok).toEqual({ ok: true, wynik: { sekcja: "logi-poczty", dane: expect.objectContaining({ wToku: true }) } });

    staffApi.mockResolvedValueOnce({ wToku: true, wczytano: null, adres: null, wpisy: [], blad: null });
    await zlecDziennikPocztyAction("s1", "");
    expect(staffApi).toHaveBeenLastCalledWith("/admin/subscriptions/s1/konto/logi-poczty", { method: "POST", body: {} });

    staffApi.mockRejectedValueOnce(new StaffApiError("Dziennik już się wczytuje — chwila.", 409));
    expect(await zlecDziennikPocztyAction("s1")).toEqual({ ok: false, error: "Dziennik już się wczytuje — chwila." });
    staffApi.mockRejectedValueOnce(new StaffApiError("Forbidden", 403));
    expect(await zlecDziennikPocztyAction("s1")).toEqual({ ok: false, error: expect.stringContaining("Podgląd konta klienta") });
  });
});
