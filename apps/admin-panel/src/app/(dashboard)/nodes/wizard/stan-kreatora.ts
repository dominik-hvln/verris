import { WIZARD_STEPS, krokKreatoraDla } from "./wizard-content";

/** Stan kreatora zapisany w sessionStorage (wznowienie po odświeżeniu). */
export type PersistedWizard = {
  stepIndex: number;
  name: string;
  hostname: string;
  region: string;
  notes: string;
  serverId: string | null;
  checked: Record<string, boolean>;
};

/**
 * Stan startowy kreatora z adresu i sessionStorage. Zapisany stan dotyczy tylko „swojego” węzła:
 * `?server=B` nie bierze kroku, nazwy, hostname ani zaznaczeń zapisanych dla węzła A (10.10 — kreator
 * mieszał dwa węzły). Krok: `?step` → zapisany krok tego węzła → (po wczytaniu węzła) krok wg statusu.
 */
export function stanStartowyKreatora(
  zapisany: Partial<PersistedWizard> | null,
  parametry: { server: string | null; step: string | null },
): { zapisany: Partial<PersistedWizard> | null; serverId: string | null; stepIndex: number | null } {
  const swoj = zapisany && (!parametry.server || zapisany.serverId === parametry.server) ? zapisany : null;
  const zParametru = parametry.step ? WIZARD_STEPS.findIndex((s) => s.id === parametry.step) : -1;
  return {
    zapisany: swoj,
    serverId: parametry.server ?? swoj?.serverId ?? null,
    stepIndex: zParametru >= 0 ? zParametru : (swoj?.stepIndex ?? null),
  };
}

/** Krok dla wczytanego węzła, gdy ani adres, ani zapis go nie wskazały. */
export function krokDlaStatusu(status: string | undefined): number {
  const k = status ? krokKreatoraDla(status) : null;
  return k ? k.numer - 1 : 0;
}
