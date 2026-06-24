import { requireAdminSession } from "@/lib/session";
import { AdminSidebar } from "@/components/sidebar";
import { LogoutButton } from "@/components/logout-button";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { FleetStatusBadge } from "@/components/fleet-status-badge";
import { CommandPalette } from "@/components/command-palette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();

  return (
    <div className="flex min-h-screen">
      <PlatformConfigLoader />
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[50%] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <AdminSidebar
        userInitials={getInitials(session)}
        userLabel={[session.firstName, session.lastName].filter(Boolean).join(" ") || session.email}
        logoutButton={<LogoutButton />}
      />

      <div className="flex-1 pl-72 relative z-10 flex flex-col">
        <header className="sticky top-0 z-40 flex h-20 items-center gap-4 border-b border-white/5 bg-black/20 backdrop-blur-md px-8">
          <div className="flex flex-1 items-center">
            <CommandPalette />
          </div>
          <div className="flex items-center gap-4">
            <FleetStatusBadge />
          </div>
        </header>

        <main className="flex-1 p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

function getInitials(session: { firstName: string | null; lastName: string | null; email: string }) {
  const first = session.firstName?.[0] ?? "";
  const last = session.lastName?.[0] ?? "";
  if (first || last) return `${first}${last}`.toUpperCase();
  return session.email.slice(0, 2).toUpperCase();
}
