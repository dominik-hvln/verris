import { renderToStaticMarkup } from "react-dom/server";

// D1 — bramka strony (uprawnienia z mapy STRONY) ma własne testy (uprawnienia-stron.spec.tsx); tu treść strony.
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), usePathname: () => "/nodes/kopie" }));

import { adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import KopieFlotyPage from "./page";
import { rozmiar, wiek, type KopieFloty, type ProbaOdtworzenia } from "./dane";

/** F3.3 — Flota → Kopie floty (GET /admin/servers/kopie; historia prób — GET /admin/live-readiness/proby-odtworzenia, ADMIN). */
const api = adminApi as jest.Mock;
const dostep = fetchStaffAccess as jest.Mock;
const teraz = Date.now();
const iso = (hTemu: number) => new Date(teraz - hTemu * 3_600_000).toISOString();

const dane = (o: Partial<KopieFloty> = {}): KopieFloty => ({
  progDni: 2,
  harmonogram: { godzina: "03:30", rozrzutMin: 30, opis: "codziennie o 03:30 (do 30 min później), czas serwera" },
  offsite: { skonfigurowany: true, retencjaDni: 30, zmienionoAt: null },
  bazaPanelu: { obecna: true, kiedy: iso(5), wiekS: 5 * 3600, rozmiar: 12_500_000 },
  wezly: [
    {
      id: "n1",
      nazwa: "web-01",
      status: "ACTIVE",
      przebieg: { kiedy: iso(6), ok: false, konta: 40, bajty: 3_200_000_000, czasS: 1500, opis: "rclone rc=3: admin-backup failed for: usr7" },
      nieaktualny: false,
      konta: { kont: 41, ok: 39, nowe: 1, nieudane: 1, bezSwiezej: 0, wlasnaRetencja: 2 },
    },
  ],
  podsumowanie: { kont: 41, ok: 39, nowe: 1, nieudane: 1, przeterminowane: 0, bezKopii: 0, lokalneNieudane: 1 },
  konta: [
    {
      accountId: "a7",
      subscriptionId: "s7",
      domena: "sklep.pl",
      login: "usr7",
      wezel: { id: "n1", nazwa: "web-01" },
      stan: "nieudana",
      ostatniaUdana: iso(30),
      rozmiar: 512_000_000,
      ostatniaNieudana: iso(6),
      lokalnaNieudana: { kiedy: iso(3), blad: "Brak miejsca na dysku" },
    },
  ],
  kontUcietych: 0,
  proby: [{ id: "p1", finishedAt: iso(24 * 40), durationSec: 125, result: "OK", source: "s3://kopie/db" }],
  ...o,
});

const proba = (o: Partial<ProbaOdtworzenia>): ProbaOdtworzenia => ({
  id: "h1",
  finishedAt: iso(48),
  durationSec: 61,
  result: "FAILED",
  objectName: "verris-2026-10-09-0300.sql.gz",
  source: "s3://kopie/db",
  owner: "Dominik",
  notes: "pg_restore: brak tabeli",
  rowCounts: {},
  ...o,
});

const render = async (wezel?: string) => renderToStaticMarkup(await KopieFlotyPage({ searchParams: Promise.resolve(wezel ? { wezel } : {}) }));

describe("kopie floty", () => {
  beforeEach(() => {
    api.mockReset();
    dostep.mockResolvedValue({ isAdmin: false, role: "STAFF", permissions: ["NODES_VIEW"] });
  });

  it("formaty: rozmiar dziesiętny, wiek w godzinach i dniach", () => {
    expect(rozmiar(512_000_000)).toBe("512 MB");
    expect(rozmiar(null)).toBe("—");
    expect(wiek(iso(5), teraz)).toBe("5 h");
    expect(wiek(iso(72), teraz)).toBe("3 dni");
  });

  it("NOC: przebieg węzła z błędem, konto z nieudaną kopią i nieudaną kopią klienta, link do karty usługi; bez historii i bez „Zmień retencję”", async () => {
    api.mockImplementation(async (url: string) => {
      if (url === "/admin/servers/kopie") return dane();
      throw new Error(`nieoczekiwane ${url}`);
    });
    const html = await render();
    expect(html).toContain("admin-backup failed for: usr7");
    expect(html).toContain("nieudany");
    expect(html).toContain('href="/subscriptions/s7?sekcja=kopie"');
    expect(html).toContain("Brak miejsca na dysku");
    expect(html).toContain("512 MB");
    expect(html).toContain("30 dni dla floty");
    expect(html).toContain("2 z własną retencją");
    expect(html).toContain('href="/nodes/kopie?wezel=n1"');
    expect(html).not.toContain("Zmień retencję");
    expect(html).not.toContain('data-karta="historia"');
    // próba starsza niż 30 dni
    expect(html).toContain("starsza niż 30 dni");
  });

  it("ADMIN: historia prób i link do zmiany retencji", async () => {
    dostep.mockResolvedValue({ isAdmin: true, role: "ADMIN", permissions: [] });
    api.mockImplementation(async (url: string) => (url === "/admin/live-readiness/proby-odtworzenia" ? [proba({})] : dane()));
    const html = await render();
    expect(html).toContain("Zmień retencję");
    expect(html.split('data-karta="historia"')[1]).toContain("pg_restore: brak tabeli");
  });

  it("?wezel= trafia do API (zawężenie), obcy znak w parametrze — cała flota", async () => {
    api.mockResolvedValue(dane());
    await render("n1");
    expect(api).toHaveBeenCalledWith("/admin/servers/kopie?wezel=n1");
    api.mockClear();
    await render("../x");
    expect(api).toHaveBeenCalledWith("/admin/servers/kopie");
  });

  it("kopie nieskonfigurowane i brak kopii bazy — widoczne ostrzeżenia; bez kont z problemem — komunikat", async () => {
    api.mockResolvedValue(dane({ offsite: { skonfigurowany: false }, bazaPanelu: { obecna: false }, konta: [], proby: [] }));
    const html = await render();
    expect(html).toContain("kopie poza serwerem nieskonfigurowane");
    expect(html).toContain("nie widać kopii");
    expect(html).toContain("Każde konto ma świeżą kopię");
    expect(html).toContain("Nie było jeszcze żadnej próby odtworzenia.");
  });

  it("weryfikacja 11.10: liczba z odmianą raz — bez „2 2 dni” i „2 2 konta”", async () => {
    const d = dane();
    api.mockResolvedValue({
      ...d,
      podsumowanie: { ...d.podsumowanie, nowe: 2, przeterminowane: 3 },
      wezly: [{ ...d.wezly[0]!, przebieg: { ...d.wezly[0]!.przebieg!, konta: 2 } }],
      kontUcietych: 2,
    });
    const html = await render();
    expect(html).toContain("dłużej niż 2 dni uruchamia alert");
    expect(html).toContain("2 konta czekają na pierwszą");
    expect(html).toContain(" · 2 konta · ");
    expect(html).toContain("I 2 konta więcej");
    expect(html).toContain("3 stare");
    expect(html).toContain("Konta: 39 świeżych z 41 · 1 nieudane");
    expect(html).not.toMatch(/\b(\d+) \1 (dni|konta|kont)\b/);
  });

  it("błąd API: strona błędu, nie pusta lista", async () => {
    api.mockRejectedValue(new Error("403"));
    expect(await render()).not.toContain("Każde konto ma świeżą kopię");
  });
});
