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
        <h1 className="text-[28px] lg:text-[34px]">Role i uprawnienia</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Szczeble obsługi (L1–L4) i działy z granularnym dostępem do panelu. ADMIN ma zawsze pełny dostęp; operator (STAFF)
          może mieć kilka ról naraz — widzi sumę ich uprawnień. Role systemowe są stałe: żeby je zmienić, sklonuj je jako własne.
        </p>
      </header>
      <RolesClient catalog={catalog.permissions} initialRoles={roles} initialOperators={operators} initialActivity={activity} />
    </div>
  );
}
