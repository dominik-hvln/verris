import { Suspense } from "react";
import { requireStaffSession } from "@/lib/staff-session";
import { StaffShell, type LicznikiMenu } from "@/components/staff-shell";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { staffGetTickets } from "@/lib/tickets-data";

/** Liczniki w menu (Skrzynka / Moje / Czeka na klienta); bez API menu działa, tylko bez liczb. */
async function liczniki(meId: string): Promise<LicznikiMenu | null> {
  try {
    const rows = (await staffGetTickets()).filter((t) => t.status !== "CLOSED");
    const teraz = Date.now();
    return {
      skrzynka: rows.length,
      moje: rows.filter((t) => t.assignedToId === meId || t.assignedTo?.id === meId).length,
      czeka: rows.filter((t) => t.status === "WAITING_CUSTOMER").length,
      poTerminie: rows.filter((t) => !t.firstResponseAt && t.slaResponseDueAt && new Date(t.slaResponseDueAt).getTime() < teraz).length,
    };
  } catch {
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  const l = await liczniki(session.id);
  return (
    <>
      <PlatformConfigLoader />
      <Suspense>
        <StaffShell session={session} liczniki={l}>
          {children}
        </StaffShell>
      </Suspense>
    </>
  );
}
