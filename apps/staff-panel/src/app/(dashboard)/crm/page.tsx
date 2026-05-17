import { staffApi } from "@/lib/staff-api";
import { StaffImpersonateButton } from "./impersonate-button";
import { CrmSearchForm } from "./search-form";

export const dynamic = "force-dynamic";

type CrmUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  companyName: string | null;
  createdAt: string;
};

export default async function StaffCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q?.trim();

  let users: CrmUserRow[] = [];
  let error: string | null = null;
  try {
    const query = new URLSearchParams({ role: "USER", limit: "100" });
    if (search) query.set("search", search);
    const usersResp = await staffApi<{ rows: CrmUserRow[] }>(`/admin/users?${query}`);
    users = usersResp.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać klientów.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Klienci</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Lista kont klientów. Użyj <strong className="text-amber-200">Panel klienta</strong>, aby zobaczyć
          usługi, domeny i ustawienia tak jak użytkownik (sesja 30 min, audyt).
        </p>
      </header>

      <CrmSearchForm initialQuery={search ?? ""} />

      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Firma</th>
                <th className="px-4 py-3">Rejestracja</th>
                <th className="px-4 py-3">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    {u.firstName || u.lastName
                      ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.companyName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("pl-PL")}
                  </td>
                  <td className="px-4 py-3">
                    <StaffImpersonateButton userId={u.id} email={u.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">Brak klientów dla podanych kryteriów.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
