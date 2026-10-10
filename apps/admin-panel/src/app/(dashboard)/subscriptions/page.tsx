import { bramkaStrony } from "@/lib/bramka-strony";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { services } from "@/lib/pl";
import { formatCredits } from "@/lib/credits";
import { adminApi } from "@/lib/api";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import { Select } from "@/components/select";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { listAdminPlans } from "../plans/data";
import { listAdminSubscriptions, parametryUslug, type FiltryUslug } from "./data";
import { STAN_USLUGI, stanUslugi } from "@/lib/stan-uslugi";

export const dynamic = "force-dynamic";

const STAN = STAN_USLUGI;
const KOLEJNOSC = ["ACTIVE", "PROVISIONING", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED", "CANCELED", "EXPIRED"];

type Parametry = { stan?: string; wezel?: string; plan?: string; q?: string; strona?: string };

/** Adres listy z filtrami w języku panelu (?stan=&wezel=&plan=&q=&strona=). */
function adres(f: Parametry): string {
  const p = new URLSearchParams();
  for (const k of ["stan", "wezel", "plan", "q", "strona"] as const) {
    const v = f[k]?.trim();
    if (v && !(k === "strona" && v === "1")) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `/subscriptions?${qs}` : "/subscriptions";
}

/**
 * PB-34 — lista usług w języku makiety. F2.4 — filtry (stan, w tym zaległe, węzeł, plan, wyszukiwanie) i stronicowanie
 * w API zamiast 200 najnowszych; eksport CSV tych samych wierszy z EXPORT_DATA (wpis w dzienniku). Bez JS: zwykły GET.
 */
export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Parametry> }) {
  const bramka = await bramkaStrony("/subscriptions");
  if (bramka) return bramka;
  const sp = await searchParams;
  const stan = sp.stan && STAN[sp.stan] ? sp.stan : undefined;
  const strona = Math.max(Number.parseInt(sp.strona ?? "1", 10) || 1, 1);
  const filtry: FiltryUslug = { status: stan, serverId: sp.wezel, planId: sp.plan, search: sp.q };
  const biezace: Parametry = { stan, wezel: sp.wezel, plan: sp.plan, q: sp.q };

  // Węzły (NODES_VIEW) i plany (PLANS_MANAGE) tylko do list wyboru — bez uprawnienia filtr znika, lista działa.
  const [wynik, wezly, plany, dostep] = await Promise.all([
    listAdminSubscriptions(filtry, strona).then(
      (d) => ({ d, error: null as string | null }),
      (e: unknown) => ({ d: null, error: e instanceof Error ? e.message : "Nie udało się pobrać listy." }),
    ),
    adminApi<{ id: string; name: string | null }[]>("/admin/servers").then((r) => (Array.isArray(r) ? r : null), () => null),
    listAdminPlans().then((r) => (Array.isArray(r) ? r : null), () => null),
    fetchStaffAccess(),
  ]);
  const { d, error } = wynik;
  const eksport = !brakUprawnienia({ wszystkie: ["SUBSCRIPTIONS_MANAGE", "EXPORT_DATA"] }, dostep);
  const csv = (() => {
    const qs = parametryUslug(filtry).toString();
    return qs ? `/api/uslugi-csv?${qs}` : "/api/uslugi-csv";
  })();
  const wszystkie = Object.values(d?.liczby ?? {}).reduce((a, b) => a + b, 0);
  const filtr = (href: string, on: boolean, tekst: string) => (
    <Link
      key={href}
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-primary bg-data-soft font-semibold text-data-hi" : "border-line-strong text-muted-foreground hover:text-foreground"}`}
    >
      {tekst}
    </Link>
  );

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Klienci i usługi</Eyebrow>
          <h1 className="text-[32px] lg:text-[40px]">Usługi</h1>
          {d ? <span className="text-[15px] text-muted-foreground">{services(d.total)}</span> : null}
        </div>
        {eksport ? (
          <a href={csv} className={`${PRZYCISK} ml-auto inline-flex items-center gap-2`} data-eksport="uslugi">
            <Download className="h-4 w-4" /> Eksport CSV
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filtr stanu">
        {filtr(adres({ ...biezace, stan: undefined }), !stan, `Wszystkie · ${wszystkie}`)}
        {KOLEJNOSC.filter((k) => d?.liczby[k] || k === stan).map((k) => filtr(adres({ ...biezace, stan: k }), stan === k, `${STAN[k]!.t} · ${d?.liczby[k] ?? 0}`))}
      </div>

      <form action="/subscriptions" className="flex flex-wrap items-end gap-2.5" aria-label="Filtry usług">
        {stan ? <input type="hidden" name="stan" value={stan} /> : null}
        <label className="flex h-[38px] w-full max-w-[360px] items-center gap-2.5 rounded-[9px] border border-line-strong bg-background px-3 text-sm focus-within:border-primary">
          <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            aria-label="Szukaj usługi: domena, login, e-mail klienta lub ID"
            placeholder="Domena, login, e-mail lub ID…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {wezly ? (
          <Select
            name="wezel"
            aria-label="Węzeł"
            defaultValue={sp.wezel ?? ""}
            wrapperClassName="w-[180px]"
            options={[{ value: "", label: "Każdy węzeł" }, ...wezly.map((w) => ({ value: w.id, label: w.name ?? w.id.slice(0, 8) }))]}
          />
        ) : null}
        {plany ? (
          <Select
            name="plan"
            aria-label="Plan"
            defaultValue={sp.plan ?? ""}
            wrapperClassName="w-[180px]"
            options={[{ value: "", label: "Każdy plan" }, ...plany.map((p) => ({ value: p.id, label: p.name }))]}
          />
        ) : null}
        <button type="submit" className={PRZYCISK}>
          Filtruj
        </button>
        {sp.q || sp.wezel || sp.plan || stan ? (
          <Link href="/subscriptions" className="text-[13px] font-semibold text-data-hi hover:underline">
            Wyczyść
          </Link>
        ) : null}
      </form>

      {error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : (
        <section className={KARTA} aria-label="Usługi">
          <div className={`${WIERSZ} !border-t-0 !py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
            <span className="min-w-0 flex-1">Usługa</span>
            <span className="hidden w-[150px] md:block">Cena</span>
            <span className="hidden w-[100px] lg:block">Założona</span>
            <span className="w-[130px]">Stan</span>
          </div>
          {!d || d.rows.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak usług dla tych filtrów.</div> : null}
          {d?.rows.map((r) => {
            const s = stanUslugi(r.status, r.provisioningStage);
            const klient = [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || r.user.email;
            return (
              <Link key={r.id} href={`/subscriptions/${r.id}`} className={`${WIERSZ} hover:bg-raised`}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{r.account?.domain ?? r.serviceTag ?? r.plan.name}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {[r.plan.name, klient, r.serviceTag ?? r.account?.daUsername].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="hidden w-[150px] flex-col md:flex">
                  <span className="font-mono text-[13px]">
                    {r.currency === "PLN" ? formatCredits(String(r.individualPrice ?? r.priceAmount)) : `${String(r.individualPrice ?? r.priceAmount)} ${r.currency}`} / {r.interval === "YEAR" ? "rok" : "mies."}
                  </span>
                  {r.individualPrice != null ? <span className="text-xs text-muted-foreground">cena indywidualna</span> : null}
                </span>
                <span className="hidden w-[100px] font-mono text-[13px] text-muted-foreground lg:block">
                  {new Date(r.createdAt).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })}
                </span>
                <span className="w-[130px]">
                  <Pigulka ton={s.ton} className="!text-xs">
                    {s.t}
                  </Pigulka>
                </span>
              </Link>
            );
          })}
          {d && d.totalPages > 1 ? (
            <nav className="flex items-center justify-end gap-2 border-t border-line p-4" aria-label="Strony">
              {strona > 1 ? (
                <Link href={adres({ ...biezace, strona: String(strona - 1) })} className="rounded-lg border border-line-strong px-3 py-1.5 text-xs hover:border-primary">
                  Poprzednia
                </Link>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {strona} / {d.totalPages}
              </span>
              {strona < d.totalPages ? (
                <Link href={adres({ ...biezace, strona: String(strona + 1) })} className="rounded-lg border border-line-strong px-3 py-1.5 text-xs hover:border-primary">
                  Następna
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
