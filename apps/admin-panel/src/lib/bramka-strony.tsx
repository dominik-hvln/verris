import { ShieldOff } from "lucide-react";
import { brakUprawnienia } from "./akcje/wezel";
import { fetchStaffAccess } from "./staff-access";
import { STRONY, type SciezkaStrony } from "./uprawnienia-stron";

/**
 * D1 (10.10) — bramka strony panelu operatora: bez uprawnienia z mapy STRONY (to samo, co ukrywa pozycję w menu
 * i w Cmd+K) strona pokazuje „Brak uprawnień” zamiast błędu API albo pustej strony. null — wolno.
 * Egzekucja i tak jest w API (@Roles + @StaffPerm).
 */
export async function bramkaStrony(sciezka: SciezkaStrony): Promise<React.ReactElement | null> {
  const { perm, tytul } = STRONY[sciezka];
  if (perm === null) return null;
  const dostep = await fetchStaffAccess();
  const powod = brakUprawnienia(perm, dostep);
  if (!powod) return null;
  return (
    <BrakUprawnien
      tytul={tytul}
      powod={dostep.niedostepne ? "Nie udało się sprawdzić uprawnień — odśwież stronę za chwilę" : powod}
      // Pulpit to strona startowa po logowaniu — operator bez DASHBOARD_VIEW zaczyna od menu.
      podpowiedz={sciezka === "/" ? "Wybierz moduł z menu." : undefined}
    />
  );
}

export function BrakUprawnien({ tytul, powod, podpowiedz }: { tytul: string; powod: string; podpowiedz?: string }) {
  return (
    <div className="space-y-6" data-brak-uprawnien="">
      <h1 className="text-[28px] lg:text-[34px]">{tytul}</h1>
      <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>Brak uprawnień.</strong> {powod}. {podpowiedz ?? "Role nadaje administrator na karcie operatora."}
        </p>
      </div>
    </div>
  );
}
