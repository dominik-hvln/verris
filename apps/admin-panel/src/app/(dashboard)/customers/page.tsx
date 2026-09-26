import Link from "next/link";
import { Search, UserCog } from "lucide-react";
import { formatCredits } from "@/lib/credits";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import { listAdminUsers } from "./data";
import { ImpersonateButton } from "./impersonate-button";
import { CreditWalletButton } from "./credit-wallet-button";
import { CreateCustomerButton } from "./create-customer-button";

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

  const MALY = `${PRZYCISK} !h-8 !px-3 !text-[13px]`;
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Klienci i usługi</Eyebrow>
          <h1 className="text-[32px] lg:text-[40px]">Klienci</h1>
          {data ? <span className="text-[15px] text-muted-foreground">{data.total.toLocaleString("pl-PL")} kont (klienci, obsługa i administratorzy)</span> : null}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <CreateCustomerButton />
        </div>
      </div>

      <section className={KARTA} aria-label="Lista klientów">
        <form action="/customers" className="flex flex-wrap items-center gap-2.5 px-[18px] py-4">
          <label className="flex h-[38px] w-full max-w-[420px] items-center gap-2.5 rounded-[9px] border border-line-strong bg-background px-3 text-sm focus-within:border-primary">
            <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
            <input
              type="text"
              name="search"
              defaultValue={search ?? ""}
              aria-label="Szukaj klienta: ID, imię lub e-mail"
              placeholder="ID, imię lub e-mail…"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button type="submit" className={PRZYCISK}>
            Szukaj
          </button>
          {search ? (
            <Link href="/customers" className="text-[13px] font-semibold text-data-hi hover:underline">
              Wyczyść
            </Link>
          ) : null}
        </form>
        <div className={`${WIERSZ} !py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
          <span className="min-w-0 flex-1">Klient</span>
          <span className="hidden w-[80px] text-right sm:block">Usługi</span>
          <span className="hidden w-[110px] text-right md:block">Portfel</span>
          <span className="hidden w-[90px] lg:block">2FA</span>
          <span className="w-[210px] text-right">Działania</span>
        </div>
        {error ? (
          <div className={`${WIERSZ} text-sm text-crit`}>{error}</div>
        ) : !data || data.rows.length === 0 ? (
          <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak kont dla tych kryteriów.</div>
        ) : (
          data.rows.map((user) => {
            const nazwa = user.firstName || user.lastName ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : user.email;
            const tresc = (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-verris-green text-[13px] font-bold uppercase text-verris-paper">
                  {nazwa.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{nazwa}</span>
                  <span className="break-all font-mono text-[12px] text-muted-foreground">{user.email}</span>
                </span>
              </>
            );
            return (
              <div key={user.id} className={WIERSZ}>
                {user.role === "USER" && !user.anonymizedAt ? (
                  <Link href={`/customers/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                    {tresc}
                  </Link>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-3">{tresc}</span>
                )}
                <span className="hidden w-[80px] text-right font-mono text-[13px] sm:block">{user.subscriptionsCount}</span>
                <span className="hidden w-[110px] text-right font-mono text-[13px] md:block">{formatCredits(user.walletBalance)}</span>
                <span className="hidden w-[90px] lg:block">
                  {user.isTwoFactorEnabled ? (
                    <Pigulka ton="ok" className="!text-xs">
                      2FA
                    </Pigulka>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">—</span>
                  )}
                </span>
                <span className="flex w-[210px] flex-wrap items-center justify-end gap-1.5">
                  {user.role !== "USER" ? (
                    <Pigulka ton={user.role === "ADMIN" ? "crit" : "warn"} kropka={false} className="!text-[11px]">
                      {user.role === "ADMIN" ? "administrator" : "obsługa"}
                    </Pigulka>
                  ) : null}
                  {user.loginBlocked ? (
                    <Pigulka ton="crit" kropka={false} className="!text-[11px]">
                      blokada logowania
                    </Pigulka>
                  ) : null}
                  {user.isInternal && !user.anonymizedAt ? (
                    <Pigulka ton="muted" kropka={false} className="!text-[11px]">
                      wewnętrzne
                    </Pigulka>
                  ) : null}
                  {user.anonymizedAt ? (
                    <span className="text-[13px] text-muted-foreground" title="Dane usunięte na wniosek klienta (RODO) — brak operacji na koncie.">
                      zanonimizowane
                    </span>
                  ) : (
                    <>
                      <CreditWalletButton userId={user.id} email={user.email} currentBalance={user.walletBalance} className={MALY} etykieta="+ K" />
                      <ImpersonateButton userId={user.id} email={user.email} accountRole={user.role} className={MALY} etykieta="Zaloguj" />
                    </>
                  )}
                </span>
              </div>
            );
          })
        )}
        {data && data.totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2 border-t border-line p-4">
            <PageNav search={search} page={page} totalPages={data.totalPages} />
          </div>
        ) : null}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserCog className="h-3.5 w-3.5" />
        Logowanie jako klient daje krótki token (30 min) i trafia do dziennika bezpieczeństwa.
      </p>
    </div>
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
            ? "pointer-events-none border-line text-muted-foreground opacity-50"
            : "border-line-strong hover:border-primary"
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
            ? "pointer-events-none border-line text-muted-foreground opacity-50"
            : "border-line-strong hover:border-primary"
        }`}
      >
        Następna
      </a>
    </>
  );
}
