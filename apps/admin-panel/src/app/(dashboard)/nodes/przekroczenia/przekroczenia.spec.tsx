import { renderToStaticMarkup } from "react-dom/server";

// D1 — bramka strony (uprawnienia z mapy STRONY) ma własne testy (uprawnienia-stron.spec.tsx); tu treść strony.
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { adminApi } from "@/lib/api";
import PrzekroczeniaStrona from "./page";
import { PrzekroczeniaLimitow } from "@/components/przekroczenia-limitow";

/** F2.6 — przekroczenia limitów floty i węzła: od najgorszego, link do zasobów usługi, stan raportu węzłów. */
const F0 = { cpu: 0, ep: 0, nproc: 0, pmem: 0, io: 0, iops: 0 };
const TERAZ = Date.parse("2026-10-11T12:00:00Z");
const DANE = {
  wiersze: [
    { serverId: "n1", wezel: "fsn-01", username: "klient1", subscriptionId: "s1", domena: "klient.pl", doba: { ...F0, ep: 25, nproc: 1 }, tydzien: { ...F0, ep: 90 }, razemDoba: 26, razemTydzien: 90 },
    { serverId: "n1", wezel: "fsn-01", username: "reczne", subscriptionId: null, domena: null, doba: F0, tydzien: { ...F0, pmem: 4 }, razemDoba: 0, razemTydzien: 4 },
  ],
  wezly: [
    { serverId: "n1", wezel: "fsn-01", odczytano: "2026-10-11T11:55:00Z", nieaktualne: false, blad: null, obcieto: false },
    { serverId: "n2", wezel: "fsn-02", odczytano: null, nieaktualne: true, blad: null, obcieto: false },
    { serverId: "n3", wezel: "fsn-03", odczytano: "2026-10-11T11:55:00Z", nieaktualne: false, blad: "brak cloudlinux-statistics (LVE-Stats 2)", obcieto: false },
  ],
};

describe("F2.6 — przekroczenia limitów", () => {
  it("flota: wiersze z faultami, link do „Zasobów i diagnozy 508”, konto spoza panelu bez linku, węzły bez raportu", async () => {
    (adminApi as jest.Mock).mockResolvedValue(DANE);
    const html = renderToStaticMarkup(await PrzekroczeniaStrona());
    expect(adminApi).toHaveBeenCalledWith("/admin/servers/przekroczenia");
    expect(html).toContain('href="/subscriptions/s1?sekcja=konto#zasoby-konta"');
    expect(html).toContain("EP 25 · NPROC 1");
    expect(html).toContain("reczne · poza panelem");
    expect(html).toContain('href="/nodes/n1?sekcja=konta#przekroczenia"');
    expect(html).toContain("fsn-02</a>: Brak raportu faultów z węzła");
    expect(html).toContain('data-raport-wezla="crit"');
    expect(html).toContain("brak cloudlinux-statistics");
  });

  it("błąd API — komunikat zamiast pustej listy", async () => {
    (adminApi as jest.Mock).mockRejectedValue(new Error("Forbidden"));
    expect(renderToStaticMarkup(await PrzekroczeniaStrona())).toContain("Nie udało się pobrać przekroczeń: Forbidden");
  });

  it("brak danych ≠ brak przekroczeń: bez aktualnego raportu nie mówimy „żadne konto”", () => {
    const bezRaportu = renderToStaticMarkup(<PrzekroczeniaLimitow dane={{ wiersze: [], wezly: [DANE.wezly[1]!] }} teraz={TERAZ} zWezlem={false} />);
    expect(bezRaportu).toContain("Brak danych");
    expect(bezRaportu).not.toContain("Żadne konto");
    const czysto = renderToStaticMarkup(<PrzekroczeniaLimitow dane={{ wiersze: [], wezly: [DANE.wezly[0]!] }} teraz={TERAZ} zWezlem={false} />);
    expect(czysto).toContain("Żadne konto nie odbiło się od limitu");
  });
});
