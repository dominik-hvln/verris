import { staffApi } from "@/lib/staff-api";

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

export default async function StaffCrmPage() {
  let users: CrmUserRow[] = [];
  let error: string | null = null;
  try {
    const usersResp = await staffApi<{ rows: CrmUserRow[] }>("/admin/users?role=USER&limit=100");
    users = usersResp.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać klientów.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">CRM klientów</h1>
        <p className="text-sm text-muted-foreground">Widok klientów z endpointu admin/users (rola USER).</p>
      </header>

      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Firma</th>
                <th className="px-4 py-3">Rola</th>
                <th className="px-4 py-3">Data rejestracji</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.companyName ?? "—"}</td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("pl-PL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? <p className="p-8 text-center text-muted-foreground">Brak klientów.</p> : null}
        </div>
      )}
    </div>
  );
}
