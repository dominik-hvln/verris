import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import FleetCapacityPage from "./page";

// t1 z produkcji 06.10: plan sprzedał 200% / 8 GB / 50 GB, a konto realnie zużywa ułamek.
const t1 = {
  id: "t1",
  name: "TEST-NRB-01",
  region: "DE-NBG",
  status: "ACTIVE",
  accounts: 1,
  pozaPula: "poza pulą — wstrzymany",
  acceptsNewAccounts: false,
  reservedHeadroomPercent: 0,
  maxAccounts: null,
  zasoby: {
    fizyczna: { cpu: 400, ramMb: 7475, diskMb: 76800 },
    sprzedawalna: { cpu: 800, ramMb: 11212.5, diskMb: 92160 },
    przydzielone: { cpu: 200, ramMb: 8192, diskMb: 51200 },
    zuzyte: { cpu: 3, ramMb: 71, diskMb: 2662 },
    zapas: { kont: 0, wymiar: "RAM" },
  },
};

const tekst = async () =>
  renderToStaticMarkup(await FleetCapacityPage()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Pojemność floty", () => {
  it("zużycie z telemetrii osobno od sprzedanych limitów (nie 100% RAM przy 71 MB)", async () => {
    (adminApi as jest.Mock).mockResolvedValue({ wezly: [t1] });
    const t = await tekst();
    expect(adminApi).toHaveBeenCalledWith("/admin/servers/wykresy?zakres=1h&sort=nazwa");
    expect(t).toContain("RAM floty · zużycie 1%");
    expect(t).toContain("sprzedane 73% (8 GB / 10,9 GB)");
    expect(t).toContain("Dysk · zużycie 3%");
    expect(t).toContain("71 MB / 7,3 GB");
    expect(t).toContain("8 GB / 10,9 GB (×1,5)");
    expect(t).toContain("żaden węzeł nie przyjmuje nowych kont");
    expect(t).not.toContain("RAM floty · zużycie 100%");
  });

  it("wiersz węzła prowadzi do jego ustawień pojemności (cordon, limity, nadsubskrypcja), nie do nieistniejącej kotwicy", async () => {
    (adminApi as jest.Mock).mockResolvedValue({ wezly: [t1] });
    const html = renderToStaticMarkup(await FleetCapacityPage());
    expect(html).toContain(`href="/nodes/${t1.id}?sekcja=konfiguracja"`);
    expect(html).not.toContain("#hosting-profile");
  });

  it("bez świeżej telemetrii nie udaje zera", async () => {
    (adminApi as jest.Mock).mockResolvedValue({ wezly: [{ ...t1, acceptsNewAccounts: true, pozaPula: null, zasoby: { ...t1.zasoby, zuzyte: null, zapas: { kont: 2, wymiar: "CPU" } } }] });
    const t = await tekst();
    expect(t).toContain("brak świeżej telemetrii");
    expect(t).toContain("z 1 węzła · 1 bez telemetrii");
    expect(t).toContain("~2 zmieszczą się w pakiecie standardowym");
  });
});
