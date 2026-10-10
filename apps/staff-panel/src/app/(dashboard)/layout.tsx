import { Suspense } from "react";
import { requireStaffSession } from "@/lib/staff-session";
import { StaffShell, type LicznikiMenu } from "@/components/staff-shell";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { staffListaZgloszen } from "@/lib/tickets-data";
import { pobierzDostepOperatora } from "@/lib/staff-access";

/**
 * Liczniki w menu (Skrzynka / Moje / Czeka na klienta); bez API menu działa, tylko bez liczb. F2.5 — liczy API
 * (`liczby` listy, jeden wiersz zamiast całej tabeli zgłoszeń przy każdym wejściu na stronę panelu).
 */
async function liczniki(): Promise<LicznikiMenu | null> {
  try {
    const { liczby } = await staffListaZgloszen({ stan: "otwarte", limit: "1" });
    return { skrzynka: liczby.otwarte, moje: liczby.moje, czeka: liczby.czeka, poTerminie: liczby.poTerminie };
  } catch {
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  const [l, dostep] = await Promise.all([liczniki(), pobierzDostepOperatora()]);
  return (
    <>
      <PlatformConfigLoader />
      <Suspense>
        <StaffShell session={session} liczniki={l} dostep={dostep}>
          {children}
        </StaffShell>
      </Suspense>
    </>
  );
}
