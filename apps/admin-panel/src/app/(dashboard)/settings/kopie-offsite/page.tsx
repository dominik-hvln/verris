import { KopieOffsiteFormularz } from "@/components/kopie-offsite-formularz";
import { fetchStaffAccess } from "@/lib/staff-access";

export const dynamic = "force-dynamic";

/**
 * Kopie offsite floty — ustawienie globalne, od którego zależy Onboard LIVE. Wcześniej było tylko
 * w kroku 4 kreatora węzła (10.10). API przyjmuje wyłącznie ADMIN-a (onboard.admin.controller.ts).
 */
export default async function KopieOffsitePage() {
  const dostep = await fetchStaffAccess();
  return (
    <div className="max-w-3xl space-y-4">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Kopie offsite</h1>
        <p className="mt-1 text-sm text-muted-foreground">Jedna konfiguracja dla całej floty — każdy węzeł pobiera ją w Onboard LIVE.</p>
      </header>
      {dostep.isAdmin ? <KopieOffsiteFormularz /> : <p className="text-sm text-muted-foreground">Tylko administrator może zmieniać kopie offsite.</p>}
    </div>
  );
}
