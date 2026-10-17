import { adresKreatora, krokDlaStatusu, stanStartowyKreatora, type PersistedWizard } from "./stan-kreatora";
import { WIZARD_STEPS } from "./wizard-content";

const idx = (id: string) => WIZARD_STEPS.findIndex((s) => s.id === id);
const A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const zapisA: PersistedWizard = { stepIndex: idx("onboard-live"), name: "A", hostname: "a.verris.pl", region: "FSN1", notes: "", serverId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", checked: { bootstrap: true } };

/** 10.10 — `?server=B` bez `step` brał krok i dane węzła A z sessionStorage. */
describe("Kreator węzła — stan startowy", () => {
  it("?server innego węzła bez step: ignoruje zapis węzła A", () => {
    const s = stanStartowyKreatora(zapisA, { server: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", step: null });
    expect(s.zapisany).toBeNull();
    expect(s.serverId).toBe("bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");
    expect(s.stepIndex).toBeNull();
  });

  it("?server tego samego węzła: wznawia zapisany krok i dane", () => {
    const s = stanStartowyKreatora(zapisA, { server: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", step: null });
    expect(s.zapisany?.name).toBe("A");
    expect(s.stepIndex).toBe(idx("onboard-live"));
  });

  it("bez parametrów: wznawia zapis", () => {
    expect(stanStartowyKreatora(zapisA, { server: null, step: null })).toMatchObject({ serverId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", stepIndex: idx("onboard-live") });
  });

  it("?step wygrywa z zapisem; nieznany krok jest pomijany", () => {
    expect(stanStartowyKreatora(zapisA, { server: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", step: "approve-da" }).stepIndex).toBe(idx("approve-da"));
    expect(stanStartowyKreatora(null, { server: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", step: "nie-ma" }).stepIndex).toBeNull();
  });

  it("krok wg statusu wczytanego węzła", () => {
    expect(krokDlaStatusu("INIT")).toBe(idx("bootstrap"));
    expect(krokDlaStatusu("PENDING_APPROVAL")).toBe(idx("approve-da"));
    expect(krokDlaStatusu("ACTIVE")).toBe(idx("backup-offsite"));
    expect(krokDlaStatusu(undefined)).toBe(0);
  });

  // Noc 15.10 (przegląd client-apifetch-path): `?server=` szło bez kodowania do adminApi(`/admin/servers/${id}`) z tokenem
  // admina — `.\t./.\t./admin/users?` czytało inną trasę. Identyfikator węzła tylko jako UUID (także z sessionStorage).
  it.each([".\t./.\t./admin/users?", "../admin/users", "x#", "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/../users", ""])("?server=%j → brak węzła", (zly) => {
    expect(stanStartowyKreatora(null, { server: zly, step: null }).serverId).toBeNull();
    expect(stanStartowyKreatora({ ...zapisA, serverId: zly }, { server: null, step: null }).serverId).toBeNull();
  });
});

describe("wznowienie kreatora (17.10, PB-31)", () => {
  it("węzeł ACTIVE bez ?step trafia na kopie off-site, nie na „Wymagania”", () => {
    expect(WIZARD_STEPS[krokDlaStatusu("ACTIVE")]!.id).toBe("backup-offsite");
  });
  it("adres kreatora niesie węzeł i krok — da się go otworzyć w nowej karcie", () => {
    expect(adresKreatora(A, "bootstrap")).toBe(`/nodes/wizard?server=${A}&step=bootstrap`);
    expect(stanStartowyKreatora(null, { server: A, step: "bootstrap" })).toMatchObject({ serverId: A, stepIndex: idx("bootstrap") });
  });
});
