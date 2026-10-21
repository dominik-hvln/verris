import { bramkaStrony } from "@/lib/bramka-strony";
import { BladStrony } from "@/components/blad-strony";
import { KARTA } from "@/components/v2";
import { adminApi } from "@/lib/api";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { fetchStaffAccess } from "@/lib/staff-access";
import { StanFaliPanel } from "../stack/stan-fali";
import type { PodsumowanieAktualizacji } from "./actions";
import { AktualizacjePanel } from "./aktualizacje-panel";

export const dynamic = "force-dynamic";

/**
 * 21.10 — Aktualizacje bezpieczeństwa: oczekujące poprawki z raportów agenta węzłów (dnf z CVE, CustomBuild, alt-php),
 * wyszukiwanie po CVE i fala samych poprawek. Podgląd — NODES_VIEW, instalacja — NODES_MANAGE (servers.admin.controller.ts).
 */
export default async function AktualizacjeBezpieczenstwaPage() {
  const bramka = await bramkaStrony("/nodes/aktualizacje");
  if (bramka) return bramka;
  const dostep = await fetchStaffAccess();
  let dane: PodsumowanieAktualizacji;
  try {
    dane = await adminApi<PodsumowanieAktualizacji>("/admin/servers/aktualizacje");
  } catch (e) {
    return <BladStrony blad={e} tytul="Aktualizacje bezpieczeństwa" powrot={{ href: "/nodes", label: "Węzły" }} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Aktualizacje bezpieczeństwa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oczekujące poprawki z raportów węzłów (co ok. 6 godzin i zaraz po instalacji). Pusta lista dotyczy tylko węzłów ze świeżym raportem.
        </p>
      </header>
      <AktualizacjePanel start={dane} bezInstalacji={brakUprawnienia("NODES_MANAGE", dostep)} />
      <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="fala-h">
        <h2 id="fala-h" className="font-display text-[17px] font-bold">Fala aktualizacji</h2>
        <StanFaliPanel />
      </section>
    </div>
  );
}
