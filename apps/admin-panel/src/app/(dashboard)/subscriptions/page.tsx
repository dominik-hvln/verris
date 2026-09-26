import Link from "next/link";
import { formatCredits } from "@/lib/credits";
import { Eyebrow, KARTA, Pigulka, WIERSZ } from "@/components/v2";
import { listAdminSubscriptions } from "./data";

export const dynamic = "force-dynamic";

const STAN: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  ACTIVE: { t: "działa", ton: "ok" },
  PROVISIONING: { t: "zakładanie", ton: "warn" },
  PENDING_PAYMENT: { t: "czeka na płatność", ton: "warn" },
  PAST_DUE: { t: "zaległa płatność", ton: "warn" },
  SUSPENDED: { t: "zawieszona", ton: "crit" },
  CANCELED: { t: "anulowana", ton: "muted" },
  EXPIRED: { t: "wygasła", ton: "muted" },
};
const KOLEJNOSC = ["ACTIVE", "PROVISIONING", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED", "CANCELED", "EXPIRED"];

/** PB-34 — lista usług w języku makiety; filtr stanu w adresie (?stan=), bez JS. */
export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ stan?: string }> }) {
  const { stan } = await searchParams;
  let rows: Awaited<ReturnType<typeof listAdminSubscriptions>> = [];
  let error: string | null = null;
  try {
    rows = await listAdminSubscriptions();
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać listy.";
  }
  const liczby = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  const widoczne = stan && STAN[stan] ? rows.filter((r) => r.status === stan) : rows;
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
      <div className="flex flex-col gap-2">
        <Eyebrow>Klienci i usługi</Eyebrow>
        <h1 className="text-[32px] lg:text-[40px]">Usługi</h1>
        <span className="text-[15px] text-muted-foreground">{rows.length} najnowszych usług (API zwraca do 200)</span>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filtr stanu">
        {filtr("/subscriptions", !stan || !STAN[stan], `Wszystkie · ${rows.length}`)}
        {KOLEJNOSC.filter((k) => liczby[k]).map((k) => filtr(`/subscriptions?stan=${k}`, stan === k, `${STAN[k]!.t} · ${liczby[k]}`))}
      </div>

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
          {widoczne.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak usług.</div> : null}
          {widoczne.map((r) => {
            const s = STAN[r.status] ?? { t: r.status, ton: "muted" as const };
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
        </section>
      )}
    </div>
  );
}
