import { requireStaffSession } from "@/lib/staff-session";
import { StaffShell } from "@/components/staff-shell";
import { PlatformConfigLoader } from "@/components/platform-config-loader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  return (
    <>
      <PlatformConfigLoader />
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[50%] h-[30%] rounded-full bg-cyan-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>
      <StaffShell session={session}>{children}</StaffShell>
    </>
  );
}
