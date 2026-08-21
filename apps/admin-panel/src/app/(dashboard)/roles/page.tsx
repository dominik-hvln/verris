import { getRolesCatalog, getRoles, getOperators, getOperatorActivity } from "./actions";
import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const [catalog, roles, operators, activity] = await Promise.all([
    getRolesCatalog().catch(() => ({ permissions: [] })),
    getRoles().catch(() => []),
    getOperators().catch(() => []),
    getOperatorActivity().catch(() => []),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">Role i uprawnienia</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Działy firmy z granularnym dostępem do panelu. ADMIN ma zawsze pełny dostęp; operatorzy (STAFF) widzą tylko to,
          na co pozwala ich rola. Role systemowe możesz edytować, ale nie usunąć.
        </p>
      </header>
      <RolesClient catalog={catalog.permissions} initialRoles={roles} initialOperators={operators} initialActivity={activity} />
    </div>
  );
}
