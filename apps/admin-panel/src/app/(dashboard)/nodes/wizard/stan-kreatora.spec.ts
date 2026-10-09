import { krokDlaStatusu, stanStartowyKreatora, type PersistedWizard } from "./stan-kreatora";
import { WIZARD_STEPS } from "./wizard-content";

const idx = (id: string) => WIZARD_STEPS.findIndex((s) => s.id === id);
const zapisA: PersistedWizard = { stepIndex: idx("onboard-live"), name: "A", hostname: "a.verris.pl", region: "FSN1", notes: "", serverId: "A", checked: { bootstrap: true } };

/** 10.10 — `?server=B` bez `step` brał krok i dane węzła A z sessionStorage. */
describe("Kreator węzła — stan startowy", () => {
  it("?server innego węzła bez step: ignoruje zapis węzła A", () => {
    const s = stanStartowyKreatora(zapisA, { server: "B", step: null });
    expect(s.zapisany).toBeNull();
    expect(s.serverId).toBe("B");
    expect(s.stepIndex).toBeNull();
  });

  it("?server tego samego węzła: wznawia zapisany krok i dane", () => {
    const s = stanStartowyKreatora(zapisA, { server: "A", step: null });
    expect(s.zapisany?.name).toBe("A");
    expect(s.stepIndex).toBe(idx("onboard-live"));
  });

  it("bez parametrów: wznawia zapis", () => {
    expect(stanStartowyKreatora(zapisA, { server: null, step: null })).toMatchObject({ serverId: "A", stepIndex: idx("onboard-live") });
  });

  it("?step wygrywa z zapisem; nieznany krok jest pomijany", () => {
    expect(stanStartowyKreatora(zapisA, { server: "B", step: "approve-da" }).stepIndex).toBe(idx("approve-da"));
    expect(stanStartowyKreatora(null, { server: "B", step: "nie-ma" }).stepIndex).toBeNull();
  });

  it("krok wg statusu wczytanego węzła", () => {
    expect(krokDlaStatusu("INIT")).toBe(idx("bootstrap"));
    expect(krokDlaStatusu("PENDING_APPROVAL")).toBe(idx("approve-da"));
    expect(krokDlaStatusu("ACTIVE")).toBe(0);
    expect(krokDlaStatusu(undefined)).toBe(0);
  });
});
