import { getRolesCatalog, getRoles } from "./actions";
import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const [catalog, roles] = await Promise.all([getRolesCatalog().catch(() => ({ permissions: [] })), getRoles().catch(() => [])]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Role</h1>
        <p className="mt-2 text-sm text-muted-foreground">Uprawnienia ról się sumują; rolę systemową zmieniasz na jej kopii.</p>
      </header>
      <RolesClient catalog={catalog.permissions} initialRoles={roles} />
    </div>
  );
}
