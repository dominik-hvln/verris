import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DzialaniaWezla } from "./dzialania-wezla";
import { AKCJE_WEZLA, akcjeWezla } from "@/lib/akcje/wezel";

const ADMIN = { isAdmin: true, permissions: [] };
const operator = (...permissions: string[]) => ({ isAdmin: false, permissions });

/** 10.10 — Onboard LIVE dla istniejącego węzła był tylko w kreatorze; Dominik nie mógł go znaleźć. */
describe("Działania węzła na karcie", () => {
  it("aktywny węzeł: pełna lista z zakładek (sekcja B), Onboard LIVE prowadzi do Aktualizacji", () => {
    const ids = akcjeWezla({ id: "w1", status: "ACTIVE" }, ADMIN).map((d) => d.id);
    for (const id of ["onboard-live", "stos", "baza-danych", "profil", "audyt", "uslugi", "sonda-da", "nowe-konta", "serwis", "offline", "wycofanie", "directadmin", "nameservers", "region", "waf", "sso", "zadania"]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("kreator");
    const html = renderToStaticMarkup(<DzialaniaWezla wezel={{ id: "w1", status: "ACTIVE" }} dostep={ADMIN} />);
    expect(html).toContain('href="/nodes/w1?sekcja=aktualizacje#onboard-live"');
    expect(html).not.toContain("#bootstrap");
    expect(html).toContain('aria-label="Pomoc: Onboard LIVE"');
  });

  it("węzeł w instalacji: „Dokończ w kreatorze: krok X” z właściwym krokiem, bez operacji na działającym węźle", () => {
    const init = akcjeWezla({ id: "w1", status: "INIT" }, ADMIN);
    expect(init[0]).toMatchObject({ id: "kreator", nazwa: "Dokończ w kreatorze: krok 2", href: "/nodes/wizard?server=w1&step=bootstrap" });
    expect(init.map((d) => d.id)).not.toContain("onboard-live");
    const pending = akcjeWezla({ id: "w1", status: "PENDING_APPROVAL" }, ADMIN);
    expect(pending[0]).toMatchObject({ nazwa: "Dokończ w kreatorze: krok 3", href: "/nodes/wizard?server=w1&step=approve-da" });
  });

  it("węzeł działający nie ma odnośnika do kreatora", () => {
    expect(akcjeWezla({ id: "w1", status: "MAINTENANCE" }, ADMIN).map((d) => d.id)).not.toContain("kreator");
  });

  it("operator z samym NODES_VIEW: działania wyszarzone z powodem, podgląd dostępny", () => {
    const lista = akcjeWezla({ id: "w1", status: "ACTIVE" }, operator("NODES_VIEW"));
    const po = (id: string) => lista.find((d) => d.id === id)!;
    expect(po("onboard-live").zablokowane).toBe("Wymaga NODES_MANAGE");
    expect(po("profil").zablokowane).toBe("Wymaga roli administratora");
    expect(po("audyt").zablokowane).toBeNull();
    expect(po("zadania").zablokowane).toBeNull();
    const html = renderToStaticMarkup(<DzialaniaWezla wezel={{ id: "w1", status: "ACTIVE" }} dostep={operator("NODES_VIEW")} />);
    expect(html).not.toContain('href="/nodes/w1?sekcja=aktualizacje#onboard-live"');
    expect(html).toContain('title="Wymaga NODES_MANAGE"');
    expect(html).toContain('aria-disabled="true"');
  });

  it("operator z NODES_MANAGE: Onboard LIVE dostępny, operacje tylko dla admina dalej wyszarzone", () => {
    const lista = akcjeWezla({ id: "w1", status: "ACTIVE" }, operator("NODES_VIEW", "NODES_MANAGE"));
    expect(lista.find((d) => d.id === "onboard-live")!.zablokowane).toBeNull();
    expect(lista.find((d) => d.id === "sonda-da")!.zablokowane).toBe("Wymaga roli administratora");
  });

  it("kreator: instalacja z NODES_MANAGE, akceptacja węzła tylko dla admina (API: POST :id/approve bez @StaffPerm)", () => {
    const manage = operator("NODES_VIEW", "NODES_MANAGE");
    expect(akcjeWezla({ id: "w1", status: "INIT" }, manage).find((d) => d.id === "kreator")!.zablokowane).toBeNull();
    expect(akcjeWezla({ id: "w1", status: "PENDING_APPROVAL" }, manage).find((d) => d.id === "kreator")!.zablokowane).toBe("Wymaga roli administratora");
    expect(akcjeWezla({ id: "w1", status: "PENDING_APPROVAL" }, ADMIN).find((d) => d.id === "kreator")!.zablokowane).toBeNull();
  });

  it("każda kotwica z rejestru istnieje na stronie węzła", () => {
    const strona = readFileSync(join(__dirname, "page.tsx"), "utf8");
    for (const status of ["INIT", "ACTIVE", "OFFLINE"]) {
      for (const a of AKCJE_WEZLA.filter((x) => x.kiedy({ id: "w1", status }))) {
        const kotwica = a.href({ id: "w1", status }).split("#")[1];
        if (kotwica) expect(strona).toContain(`id="${kotwica}"`);
      }
    }
  });
});
