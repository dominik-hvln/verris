import { bramkaStrony } from "@/lib/bramka-strony";
import Link from "next/link";
import { Download, Search, UserCog } from "lucide-react";
import { formatCredits } from "@/lib/credits";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import { listAdminUsers, type FiltryKlientow } from "./data";
import { PoleDaty } from "@/components/pole-daty";
import { ImpersonateButton } from "./impersonate-button";
import { CreditWalletButton } from "./credit-wallet-button";
import { CreateCustomerButton } from "./create-customer-button";
import { getAdminSession } from "@/lib/session";
import { plForm } from "@/lib/pl";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<FiltryKlientow & { page?: string }>;
}

/** F2.4 — stany konta (API: warunkiListyKont); „Wszystkie” bez filtra. */
const STANY: { klucz: string; nazwa: string }[] = [
  { klucz: "aktywne", nazwa: "Aktywne" },
  { klucz: "zalegle", nazwa: "Zaległe" },
  { klucz: "zawieszone", nazwa: "Z zawieszoną usługą" },
  { klucz: "zablokowane", nazwa: "Blokada logowania" },
  { klucz: "usuwane", nazwa: "Do usunięcia" },
  { klucz: "wewnetrzne", nazwa: "Wewnętrzne" },
  { klucz: "zanonimizowane", nazwa: "Zanonimizowane" },
];
const KLUCZE = ["search", "status", "saldoOd", "saldoDo", "od", "do"] as const;

function adresListy(f: FiltryKlientow, page = 1, baza = "/customers"): string {
  const p = new URLSearchParams();
  for (const k of KLUCZE) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `${baza}?${qs}` : baza;
}

export default async function AdminCustomersPage({ searchParams }: PageProps) {
  const bramka = await bramkaStrony("/customers");
  if (bramka) return bramka;
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;
  const filtry: FiltryKlientow = {
    search,
    status: STANY.some((s) => s.klucz === params.status) ? params.status : undefined,
    saldoOd: params.saldoOd?.trim() || undefined,
    saldoDo: params.saldoDo?.trim() || undefined,
    od: params.od?.trim() || undefined,
    do: params.do?.trim() || undefined,
  };
  const filtrowane = KLUCZE.some((k) => filtry[k]);

  let data: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let error: string | null = null;
  try {
    data = await listAdminUsers({ ...filtry, page, limit: 50 });
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  // Tylko oznaczenie „to Ty” na liście — bez sesji lista działa bez niego.
  const ja = (await getAdminSession().catch(() => null))?.id;
  // D1 — przyciski wg uprawnień (jak strażniki API): zakładanie konta CUSTOMERS_MANAGE, kredyty BILLING_MANAGE,
  // wejście na konto CUSTOMERS_IMPERSONATE (operator — tylko na konta klientów).
  const dostep = await fetchStaffAccess();
  const zalozy = !brakUprawnienia("CUSTOMERS_MANAGE", dostep);
  const kredyty = !brakUprawnienia("BILLING_MANAGE", dostep);
  const wejdzie = !brakUprawnienia({ wszystkie: ["CUSTOMERS_VIEW", "CUSTOMERS_IMPERSONATE"] }, dostep);
  // F2.4 — eksport CSV (dane osobowe): EXPORT_DATA, jak API; eksportuje tylko konta klientów.
  const eksport = !brakUprawnienia({ wszystkie: ["CUSTOMERS_VIEW", "EXPORT_DATA"] }, dostep);
  const MALY = `${PRZYCISK} !h-8 !px-3 !text-[13px]`;
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Klienci i usługi</Eyebrow>
          <h1 className="text-[32px] lg:text-[40px]">Klienci</h1>
          {data ? <span className="text-[15px] text-muted-foreground">{data.total.toLocaleString("pl-PL")} {plForm(data.total, "konto", "konta", "kont")} (klienci, obsługa i administratorzy)</span> : null}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {eksport ? (
            <a href={adresListy({ ...filtry }, 1, "/api/klienci-csv")} className={`${PRZYCISK} inline-flex items-center gap-2`} data-eksport="klienci">
              <Download className="h-4 w-4" /> Eksport CSV
            </a>
          ) : null}
          {zalozy ? <CreateCustomerButton /> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filtr stanu konta">
        {[{ klucz: "", nazwa: "Wszystkie" }, ...STANY].map((s) => {
          const on = (filtry.status ?? "") === s.klucz;
          return (
            <Link
              key={s.klucz || "wszystkie"}
              href={adresListy({ ...filtry, status: s.klucz || undefined })}
              aria-current={on ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-primary bg-data-soft font-semibold text-data-hi" : "border-line-strong text-muted-foreground hover:text-foreground"}`}
            >
              {s.nazwa}
            </Link>
          );
        })}
      </div>

      <section className={KARTA} aria-label="Lista klientów">
        <form action="/customers" className="flex flex-wrap items-end gap-2.5 px-[18px] py-4">
          {filtry.status ? <input type="hidden" name="status" value={filtry.status} /> : null}
          <label className="flex h-[38px] w-full max-w-[420px] items-center gap-2.5 rounded-[9px] border border-line-strong bg-background px-3 text-sm focus-within:border-primary">
            <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
            <input
              type="text"
              name="search"
              defaultValue={search ?? ""}
              aria-label="Szukaj klienta: ID, imię, e-mail, firma lub NIP"
              placeholder="ID, imię, e-mail, firma lub NIP…"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <input
            name="saldoOd"
            inputMode="decimal"
            defaultValue={filtry.saldoOd ?? ""}
            aria-label="Saldo portfela od (zł)"
            placeholder="Saldo od"
            className="h-[38px] w-[110px] rounded-[9px] border border-line-strong bg-background px-3 text-sm"
          />
          <input
            name="saldoDo"
            inputMode="decimal"
            defaultValue={filtry.saldoDo ?? ""}
            aria-label="Saldo portfela do (zł)"
            placeholder="Saldo do"
            className="h-[38px] w-[110px] rounded-[9px] border border-line-strong bg-background px-3 text-sm"
          />
          <PoleDaty name="od" aria-label="Konto założone od" placeholder="Założone od" defaultValue={filtry.od ?? ""} wrapperClassName="w-[160px]" />
          <PoleDaty name="do" aria-label="Konto założone do" placeholder="Założone do" defaultValue={filtry.do ?? ""} wrapperClassName="w-[160px]" />
          <button type="submit" className={PRZYCISK}>
            Szukaj
          </button>
          {filtrowane ? (
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
            // Zanonimizowane (RODO): zamiast „deleted-<uuid>@verris.local” dwa razy — krótka etykieta i skrót id.
            const nazwa = user.anonymizedAt
              ? "Konto usunięte"
              : user.firstName || user.lastName
                ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                : user.email;
            const podpis = user.anonymizedAt ? `#${user.id.slice(0, 8)}` : user.email;
            const tresc = (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-verris-green text-[13px] font-bold uppercase text-verris-paper">
                  {nazwa.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{nazwa}</span>
                  <span className="break-all font-mono text-[12px] text-muted-foreground">{podpis}</span>
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
                      {kredyty ? <CreditWalletButton userId={user.id} email={user.email} currentBalance={user.walletBalance} className={MALY} etykieta="+ K" /> : null}
                      {wejdzie && user.id !== ja && (dostep.isAdmin || user.role === "USER") ? (
                        <ImpersonateButton userId={user.id} email={user.email} accountRole={user.role} className={MALY} etykieta="Zaloguj" />
                      ) : null}
                    </>
                  )}
                </span>
              </div>
            );
          })
        )}
        {data && data.totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2 border-t border-line p-4">
            <PageNav filtry={filtry} page={page} totalPages={data.totalPages} />
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
  filtry,
  page,
  totalPages,
}: {
  filtry: FiltryKlientow;
  page: number;
  totalPages: number;
}) {
  const buildHref = (target: number) => adresListy(filtry, target);

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
