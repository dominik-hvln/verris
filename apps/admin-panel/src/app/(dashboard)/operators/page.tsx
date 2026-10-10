import { Select } from "@/components/select";
import Link from "next/link";
import { Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { listOperators, type OperatorRole } from "./data";
import { DodajOperatora } from "./dodaj-operatora";
import { getOperatorActivity, getRoles } from "../roles/actions";
import { wynik } from "@/components/blad-strony";
import { NieWczytano } from "@/components/nie-wczytano";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { fetchStaffAccess } from "@/lib/staff-access";
import { plForm } from "@/lib/pl";

export const dynamic = "force-dynamic";

/**
 * Drugi składnik przy logowaniu hasłem = TOTP. Sam passkey nie zamyka logowania hasłem (dopiero
 * REQUIRE_PASSKEY_FOR_STAFF po pierwszym logowaniu kluczem), a REQUIRE_2FA_FOR_STAFF sprawdza tylko TOTP
 * (auth.service.ts) — konto z samym passkey to nadal „BRAK TOTP” (przegląd 1B-2).
 */
const drugiSkladnik = (op: { isTwoFactorEnabled: boolean }) => op.isTwoFactorEnabled;
const passkey = (op: { passkeys?: number | null }) => (op.passkeys ? `passkey ×${op.passkeys}` : null);

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
  const [dostep, role_, aktywnosc] = await Promise.all([
    fetchStaffAccess(),
    // Fala 1B — błąd API to komunikat z ponowieniem, nie pusty wybór ról ani „Brak zarejestrowanych działań”.
    wynik(getRoles()),
    wynik(getOperatorActivity()),
  ]);
  try {
    data = await listOperators({ search, role, page });
  } catch (e) {
    error = e instanceof Error ? e.message : "Nieznany błąd";
  }
  // POST /admin/staff-roles/operators — tylko ADMIN.
  const tylkoAdmin = brakUprawnienia("ADMIN", dostep);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] lg:text-[34px]">
            Operatorzy (STAFF / ADMIN)
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Role, blokadę i dostęp do Grafany zmienisz na karcie operatora.
          </p>
        </div>
        {data ? (
          <div className="text-right text-xs text-muted-foreground">
            <div>
              {data.rows.length} z {data.total.toLocaleString("pl-PL")} {plForm(data.total, "operatora", "operatorów", "operatorów")}
            </div>
            {/* Fala 1B — stan 2FA zespołu tylko do odczytu; wymuszenie zostaje w REQUIRE_2FA_FOR_STAFF (decyzja D10). */}
            <div data-stan-2fa="">
              2FA (TOTP): {data.rows.filter(drugiSkladnik).length} z {data.rows.length} · passkey: {data.rows.filter((op) => (op.passkeys ?? 0) > 0).length}
            </div>
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
              <label htmlFor="operators-search" className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Szukaj
              </label>
              <div className="relative flex items-center px-3 py-2 border border-white/10 rounded-lg bg-white/5">
                <Search className="h-4 w-4 text-muted-foreground mr-2" />
                <input
                  id="operators-search"
                  type="text"
                  name="search"
                  defaultValue={search ?? ""}
                  placeholder="e-mail, imię, nazwisko"
                  className="bg-transparent border-none outline-none text-sm text-white w-full"
                />
              </div>
            </div>
            <div>
              <label htmlFor="operators-role" className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Rola
              </label>
              {/* Komponent serwerowy: Select w trybie niekontrolowanym (defaultValue), wartość idzie w GET jako `role`. */}
              <Select
                id="operators-role"
                name="role"
                defaultValue={role ?? ""}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                options={[
                  { value: "", label: "— wszyscy —" },
                  { value: "STAFF", label: "STAFF" },
                  { value: "ADMIN", label: "ADMIN" },
                ]}
              />
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
                    <th className="px-6 py-4 font-medium">2FA / passkey</th>
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
                      <td className="px-6 py-4" data-drugi-skladnik={drugiSkladnik(op) ? "tak" : "brak"}>
                        {drugiSkladnik(op) ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3" />
                            {["TOTP", passkey(op)].filter(Boolean).join(" · ")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                            <ShieldAlert className="h-3 w-3" />
                            {["BRAK TOTP", passkey(op)].filter(Boolean).join(" · ")}
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
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {op.role === "ADMIN" ? "zawsze" : op.canAccessGrafana ? "tak" : "nie"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="dodaj-operatora">
        <h2 id="dodaj-operatora" className="mb-3 text-sm font-bold uppercase tracking-widest text-neutral-400">
          Dodaj operatora
        </h2>
        {tylkoAdmin ? (
          <p aria-disabled="true" title={tylkoAdmin} className="cursor-not-allowed text-sm text-muted-foreground opacity-60">
            Dodaj operatora — {tylkoAdmin}
          </p>
        ) : role_.ok ? (
          <DodajOperatora role={role_.dane} />
        ) : (
          <NieWczytano co="ról do wyboru" />
        )}
      </section>

      <section aria-labelledby="aktywnosc-operatorow">
        <h2 id="aktywnosc-operatorow" className="mb-3 text-sm font-bold uppercase tracking-widest text-neutral-400">
          Dziennik aktywności operatorów
        </h2>
        {!aktywnosc.ok ? (
          <NieWczytano co="dziennika aktywności" />
        ) : aktywnosc.dane.length === 0 ? (
          <p className="text-sm text-neutral-500">Brak zarejestrowanych działań.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[150px_1fr_1fr] gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
              <span>Kiedy</span>
              <span>Operator → akcja</span>
              <span>Cel / IP</span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              {aktywnosc.dane.map((a) => (
                <div key={a.id} className="grid grid-cols-[150px_1fr_1fr] gap-2 border-b border-white/5 px-4 py-2 text-sm last:border-0">
                  <span className="text-neutral-400">{new Date(a.createdAt).toLocaleString("pl-PL")}</span>
                  <span className="min-w-0">
                    <span className="text-white">{a.actor ?? "—"}</span>
                    <span className="text-neutral-500"> · </span>
                    <span className="font-mono text-[12px] text-indigo-300">{a.action}</span>
                  </span>
                  <span className="min-w-0 truncate text-neutral-400">
                    {a.target ?? ""}
                    {a.ip ? ` · ${a.ip}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">Pełny audyt z filtrami jest w „Dzienniku bezpieczeństwa”.</p>
      </section>
    </div>
  );
}
