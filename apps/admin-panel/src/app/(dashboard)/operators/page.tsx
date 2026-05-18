import Link from "next/link";
import { Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { listOperators, type OperatorRole } from "./data";
import { GrafanaAccessToggle } from "./grafana-toggle";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ search?: string; role?: string; page?: string }>;
}

export default async function OperatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const roleFilter = (params.role?.toUpperCase() as OperatorRole | undefined) ?? undefined;
  const role: OperatorRole | undefined =
    roleFilter === "STAFF" || roleFilter === "ADMIN" ? roleFilter : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  let data: Awaited<ReturnType<typeof listOperators>> | null = null;
  let error: string | null = null;
  try {
    data = await listOperators({ search, role, page });
  } catch (e) {
    error = e instanceof Error ? e.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
            Operatorzy (STAFF / ADMIN)
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Konta wewnętrzne. Tu włączasz/wyłączasz dostęp do Grafany dla STAFF
            (ADMIN ma dostęp domyślnie). Każda zmiana flagi jest audytowana.
          </p>
        </div>
        {data ? (
          <div className="text-xs text-muted-foreground">
            {data.rows.length} z {data.total.toLocaleString("pl-PL")} operatorów
          </div>
        ) : null}
      </header>

      <div className="relative rounded-2xl p-[1px] overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-indigo-500/20 to-transparent"></div>
        <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col shadow-2xl">
          <form
            action="/operators"
            className="p-6 border-b border-white/10 flex flex-wrap gap-3 items-end"
          >
            <div className="flex-1 min-w-[260px]">
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Szukaj
              </label>
              <div className="relative flex items-center px-3 py-2 border border-white/10 rounded-lg bg-white/5">
                <Search className="h-4 w-4 text-muted-foreground mr-2" />
                <input
                  type="text"
                  name="search"
                  defaultValue={search ?? ""}
                  placeholder="email, imię, nazwisko"
                  className="bg-transparent border-none outline-none text-sm text-white w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Rola
              </label>
              <select
                name="role"
                defaultValue={role ?? ""}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— wszyscy —</option>
                <option value="STAFF">STAFF</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/25"
              >
                Filtruj
              </button>
              <Link
                href="/operators"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300 hover:bg-white/10"
              >
                Wyczyść
              </Link>
            </div>
          </form>

          {error ? (
            <div className="p-10 text-center text-sm text-rose-300">{error}</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Brak operatorów spełniających kryteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white">
                <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Operator</th>
                    <th className="px-6 py-4 font-medium">Rola</th>
                    <th className="px-6 py-4 font-medium">2FA</th>
                    <th className="px-6 py-4 font-medium">Login</th>
                    <th className="px-6 py-4 font-medium">Grafana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.rows.map((op) => (
                    <tr key={op.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/operators/${op.id}`}
                          className="font-medium text-white hover:text-indigo-300"
                        >
                          {op.firstName || op.lastName
                            ? `${op.firstName ?? ""} ${op.lastName ?? ""}`.trim()
                            : op.email}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{op.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            op.role === "ADMIN"
                              ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          {op.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {op.isTwoFactorEnabled ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3" />
                            tak
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                            <ShieldAlert className="h-3 w-3" />
                            BRAK
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {op.loginBlocked ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                            ZABLOKOWANY
                          </span>
                        ) : (
                          <span className="text-muted-foreground">aktywny</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <GrafanaAccessToggle
                          userId={op.id}
                          initialValue={op.canAccessGrafana}
                          role={op.role}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        STAFF bez aktywnej flagi Grafana otrzyma 403 z `forward_auth` Caddy. ADMIN
        nie wymaga toggle&apos;a. Toggle audytowany jako{" "}
        <code>ADMIN_CUSTOMER_GRAFANA_ACCESS_TOGGLED</code>.
      </p>
    </div>
  );
}
