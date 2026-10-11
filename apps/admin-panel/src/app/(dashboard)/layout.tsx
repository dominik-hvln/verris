import { requireAdminSession } from "@/lib/session";
import { fetchStaffAccess } from "@/lib/staff-access";
import { adminApi } from "@/lib/api";
import { AdminShell, type LicznikiMenu } from "@/components/admin-shell";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { asystentDostepny } from "@/components/asystent-actions";
import { BanerIncydentow, type StanObslugi } from "@/components/baner-incydentow";

/** F3.8 — trwające incydenty i prace (baner „czy to awaria u was?”); bez API albo bez uprawnień — bez baneru. */
async function stanObslugi(): Promise<StanObslugi | null> {
  try {
    return await adminApi<StanObslugi>("/admin/status-obslugi");
  } catch {
    return null;
  }
}

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
  const [access, l, asystent, baner] = await Promise.all([fetchStaffAccess(), liczniki(), asystentDostepny(), stanObslugi()]);

  return (
    <>
      <PlatformConfigLoader />
      <AdminShell
        uzytkownik={[session.firstName, session.lastName].filter(Boolean).join(" ") || session.email}
        inicjaly={inicjaly(session)}
        rola={access.niedostepne ? "brak uprawnień" : access.isAdmin ? "administrator" : access.roleName || "operator"}
        isAdmin={access.isAdmin}
        permissions={access.permissions}
        uprawnieniaNiedostepne={access.niedostepne}
        liczniki={l}
        asystent={asystent}
      >
        <BanerIncydentow stan={baner} />
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
