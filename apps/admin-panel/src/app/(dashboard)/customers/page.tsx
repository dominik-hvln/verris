import Link from "next/link";
import { Mail, ShieldCheck, Search, UserCog } from "lucide-react";
import { listAdminUsers } from "./data";
import { ImpersonateButton } from "./impersonate-button";
import { CreditWalletButton } from "./credit-wallet-button";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function AdminCustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  let data: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let error: string | null = null;
  try {
    data = await listAdminUsers({ search, page, limit: 50 });
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
            Baza Klientów
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pełny dostęp do profili i środowisk klientów (C-Level).
          </p>
        </div>
        {data && (
          <div className="text-xs text-muted-foreground">
            {data.total.toLocaleString("pl-PL")} użytkowników
          </div>
        )}
      </header>

      <div className="relative rounded-2xl p-[1px] overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-indigo-500/20 to-transparent"></div>
        <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col shadow-2xl">
          <form
            action="/customers"
            className="p-6 border-b border-white/10 flex justify-between items-center"
          >
            <div className="relative w-[360px]">
              <div className="absolute inset-0 bg-white/5 rounded-xl"></div>
              <div className="relative flex items-center px-4 py-2 border border-white/10 rounded-xl">
                <Search className="h-4 w-4 text-muted-foreground mr-3" />
                <input
                  type="text"
                  name="search"
                  defaultValue={search ?? ""}
                  placeholder="ID, imię lub email…"
                  className="bg-transparent border-none outline-none text-sm text-white placeholder:text-muted-foreground w-full"
                />
              </div>
            </div>
            <button
              type="submit"
              className="text-sm font-medium text-white flex items-center gap-2 hover:bg-white/5 px-4 py-2 rounded-lg transition-colors border border-white/10"
            >
              Szukaj
            </button>
          </form>

          {error ? (
            <div className="p-10 text-center text-sm text-rose-300">{error}</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Brak użytkowników dla tych kryteriów.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white">
                <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Klient</th>
                    <th className="px-6 py-4 font-medium">Rola</th>
                    <th className="px-6 py-4 font-medium">Subskrypcje</th>
                    <th className="px-6 py-4 font-medium">Wallet</th>
                    <th className="px-6 py-4 font-medium">2FA</th>
                    <th className="px-6 py-4 text-right font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.rows.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-white/5 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold uppercase">
                            {(user.firstName ?? user.email).charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-white">
                              {user.firstName || user.lastName
                                ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                                : user.email}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" /> {user.email}
                              {user.loginBlocked ? (
                                <span className="ml-2 rounded border border-rose-500/30 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                                  LOGIN BLOCK
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {user.subscriptionsCount}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-white">
                        <span className="tabular-nums">
                          {Number.parseFloat(user.walletBalance).toFixed(2)} K
                        </span>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          ≈ {Number.parseFloat(user.walletBalance).toFixed(2)} zł
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {user.isTwoFactorEnabled ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3" /> 2FA
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        {user.role === "USER" ? (
                          <Link
                            href={`/customers/${user.id}`}
                            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-200 hover:bg-white/10"
                          >
                            Operacje
                          </Link>
                        ) : null}
                        <CreditWalletButton
                            userId={user.id}
                            email={user.email}
                            currentBalance={user.walletBalance}
                          />
                          <ImpersonateButton
                            userId={user.id}
                            email={user.email}
                            role={user.role}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5">
              <PageNav search={search} page={page} totalPages={data.totalPages} />
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <UserCog className="h-3.5 w-3.5" />
        Impersonacja generuje krótki token (30 min) i jest pełniej rejestrowana w
        Logach Bezpieczeństwa.
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
        ADMIN
      </span>
    );
  }
  if (role === "STAFF") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        STAFF
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-neutral-400 border border-white/10">
      USER
    </span>
  );
}

function PageNav({
  search,
  page,
  totalPages,
}: {
  search?: string;
  page: number;
  totalPages: number;
}) {
  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  return (
    <>
      <a
        href={buildHref(page - 1)}
        aria-disabled={page <= 1}
        className={`text-xs px-3 py-1.5 rounded-lg border ${
          page <= 1
            ? "border-white/5 bg-white/[0.02] text-neutral-600 pointer-events-none"
            : "border-white/10 bg-white/5 text-white hover:bg-white/10"
        }`}
      >
        Poprzednia
      </a>
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      <a
        href={buildHref(page + 1)}
        aria-disabled={page >= totalPages}
        className={`text-xs px-3 py-1.5 rounded-lg border ${
          page >= totalPages
            ? "border-white/5 bg-white/[0.02] text-neutral-600 pointer-events-none"
            : "border-white/10 bg-white/5 text-white hover:bg-white/10"
        }`}
      >
        Następna
      </a>
    </>
  );
}
