import { requireAdminSession } from "@/lib/session";
import { fetchStaffAccess } from "@/lib/staff-access";
import { adminApi } from "@/lib/api";
import { AdminShell, type LicznikiMenu } from "@/components/admin-shell";
import { PlatformConfigLoader } from "@/components/platform-config-loader";

/** Liczniki w menu i stan floty w nagłówku; bez API menu działa, tylko bez liczb. */
async function liczniki(): Promise<LicznikiMenu | null> {
  try {
    return await adminApi<LicznikiMenu>("/admin/dashboard/menu");
  } catch {
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  const [access, l] = await Promise.all([fetchStaffAccess(), liczniki()]);

  return (
    <>
      <PlatformConfigLoader />
      <AdminShell
        uzytkownik={[session.firstName, session.lastName].filter(Boolean).join(" ") || session.email}
        inicjaly={inicjaly(session)}
        rola={access.isAdmin ? "administrator" : access.roleName || "operator"}
        isAdmin={access.isAdmin}
        permissions={access.permissions}
        liczniki={l}
      >
        {children}
      </AdminShell>
    </>
  );
}

function inicjaly(session: { firstName: string | null; lastName: string | null; email: string }) {
  const a = session.firstName?.[0] ?? "";
  const b = session.lastName?.[0] ?? "";
  if (a || b) return `${a}${b}`.toUpperCase();
  return session.email.slice(0, 2).toUpperCase();
}
