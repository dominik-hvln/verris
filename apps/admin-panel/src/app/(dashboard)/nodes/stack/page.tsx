import { BladStrony } from "@/components/blad-strony";
import { KARTA } from "@/components/v2";
import { adminApi } from "@/lib/api";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { fetchStaffAccess } from "@/lib/staff-access";
import { FleetUpdateButton } from "../fleet-update-button";
import type { WidokStosu } from "./actions";
import { PakietyFlotyPanel } from "./pakiety-floty";
import { WersjeStosu } from "./wersje-stosu";

export const dynamic = "force-dynamic";

/** Działanie bez uprawnień — wyszarzone z dymkiem (decyzja 10.10), jak na karcie węzła. */
function Wyszarzone({ nazwa, powod }: { nazwa: string; powod: string }) {
  return (
    <span aria-disabled="true" title={powod} className="cursor-not-allowed text-sm font-semibold text-muted-foreground opacity-60">
      {nazwa}
      <span className="sr-only"> — {powod}</span>
    </span>
  );
}

function Sekcja({ id, tytul, opis, children }: { id: string; tytul: string; opis: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="font-display text-[17px] font-bold">
        {tytul}
      </h2>
      <p className="text-sm text-muted-foreground">{opis}</p>
      {children}
    </section>
  );
}

/**
 * Operacje floty (propozycja 10.10, patch 8) — wszystko, co działa na wszystkich węzłach naraz: aktualizacja
 * stosu (NODES_MANAGE), manifest z wyrównaniem i pakiety DA (w API tylko ADMIN: stos-wezla.admin.controller.ts,
 * servers.admin.controller.ts). Wcześniej w trzech miejscach: lista węzłów, „Wersje stosu”, karta planu.
 */
export default async function OperacjeFlotyPage() {
  const dostep = await fetchStaffAccess();
  let stos: WidokStosu | null = null;
  if (dostep.isAdmin) {
    try {
      stos = await adminApi<WidokStosu>("/admin/stack-manifest");
    } catch (e) {
      return <BladStrony blad={e} tytul="Operacje floty" powrot={{ href: "/nodes", label: "Węzły" }} />;
    }
  }
  const bezAktualizacji = brakUprawnienia("NODES_MANAGE", dostep);
  const tylkoAdmin = brakUprawnienia("ADMIN", dostep);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Operacje floty</h1>
        <p className="mt-1 text-sm text-muted-foreground">Zmiany obejmujące całą flotę.</p>
      </header>

      <Sekcja id="aktualizuj-flote" tytul="Aktualizuj flotę" opis="Najnowsza stabilna wersja DirectAdmina, CloudLinux i LiteSpeed na każdym węźle.">
        <div className="flex">{bezAktualizacji ? <Wyszarzone nazwa="Aktualizuj flotę" powod={bezAktualizacji} /> : <FleetUpdateButton />}</div>
      </Sekcja>

      {stos ? (
        <WersjeStosu start={stos} />
      ) : (
        <Sekcja id="wersje-stosu" tytul="Wersje stosu" opis="Manifest wersji dla floty i wyrównanie istniejących węzłów.">
          <Wyszarzone nazwa="Wyrównaj flotę" powod={tylkoAdmin ?? ""} />
        </Sekcja>
      )}

      <Sekcja id="pakiety" tytul="Pakiety DirectAdmina" opis="Po zmianie limitów planu wyślij pakiety — konta dostaną nowe limity od razu.">
        {tylkoAdmin ? <Wyszarzone nazwa="Wyślij pakiety" powod={tylkoAdmin} /> : <PakietyFlotyPanel />}
      </Sekcja>
    </div>
  );
}
