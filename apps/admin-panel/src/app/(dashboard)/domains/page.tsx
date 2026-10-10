import { bramkaStrony } from "@/lib/bramka-strony";
import Link from "next/link";
import { Search } from "lucide-react";
import { adminApi } from "@/lib/api";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import { Pomoc } from "@/components/pomoc";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { listaDomen, STAN_ZAMOWIENIA, stanDomeny, TYP_ZAMOWIENIA, type ZamowienieDomeny } from "./data";
import { PonowZamowienie, SprawdzTransfery } from "./ponow-zamowienie";

export const dynamic = "force-dynamic";

type Parametry = { widok?: string; rejestr?: string; wygasa?: string; q?: string; strona?: string };

/** Adres listy z filtrami (?widok=&rejestr=&wygasa=&q=&strona=). */
function adres(f: Parametry): string {
  const p = new URLSearchParams();
  for (const k of ["widok", "rejestr", "wygasa", "q", "strona"] as const) {
    const v = f[k]?.trim();
    if (v && !(k === "strona" && v === "1")) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `/domains?${qs}` : "/domains";
}

const data = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—");
const kto = (u: { email: string; firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

/**
 * F2.7 (OI-01, OI-09) — wszystkie domeny platformy: kupione u nas (rejestrator) i tylko dopisane do kont, z filtrem
 * wygasających w N dni i stanu u rejestratora. Widok „Nieudane” — rejestracje i transfery, za które klient zapłacił
 * (albo chciał), a domeny nie ma: „Ponów” od L3; transfery czekające u rejestratora z „Sprawdź u rejestratora”.
 * Odczyt — CUSTOMERS_VIEW (L1).
 */
export default async function DomenyPage({ searchParams }: { searchParams: Promise<Parametry> }) {
  const bramka = await bramkaStrony("/domains");
  if (bramka) return bramka;
  const sp = await searchParams;
  const widok = sp.widok === "nieudane" ? "nieudane" : "domeny";
  const rejestr = ["verris", "poza", "odeszla"].includes(sp.rejestr ?? "") ? sp.rejestr : undefined;
  const wygasa = /^\d{1,3}$/.test(sp.wygasa ?? "") ? sp.wygasa : undefined;
  const strona = Math.max(Number.parseInt(sp.strona ?? "1", 10) || 1, 1);
  const biezace: Parametry = { rejestr, wygasa, q: sp.q };

  const [lista, zamowienia, dostep] = await Promise.all([
    listaDomen({ rejestr, wygasa, q: sp.q }, strona).then(
      (d) => ({ d, error: null as string | null }),
      (e: unknown) => ({ d: null, error: e instanceof Error ? e.message : "Nie udało się pobrać listy domen." }),
    ),
    widok === "nieudane"
      ? adminApi<{ nieudane: ZamowienieDomeny[]; wToku: ZamowienieDomeny[] }>("/admin/domains/zamowienia").then(
          (z) => ({ z, error: null as string | null }),
          (e: unknown) => ({ z: null, error: e instanceof Error ? e.message : "Nie udało się pobrać zamówień." }),
        )
      : null,
    fetchStaffAccess(),
  ]);
  const { d, error } = lista;
  const zapis = brakUprawnienia("DOMAINS_MANAGE", dostep);
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
        <h1 className="flex items-center gap-2 text-[32px] lg:text-[40px]">
          Domeny <Pomoc id="domeny" />
        </h1>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filtr domen">
        {filtr("/domains", widok === "domeny" && !rejestr && !wygasa, "Wszystkie")}
        {filtr(adres({ rejestr: "verris" }), widok === "domeny" && rejestr === "verris" && !wygasa, `U Verris · ${d?.liczby.verris ?? 0}`)}
        {filtr(adres({ wygasa: "30" }), widok === "domeny" && wygasa === "30", `Wygasają w 30 dni · ${d?.liczby.wygasa30 ?? 0}`)}
        {filtr(adres({ rejestr: "poza" }), widok === "domeny" && rejestr === "poza", "Poza Verris")}
        {filtr(adres({ rejestr: "odeszla" }), widok === "domeny" && rejestr === "odeszla", "Odeszły")}
        {filtr(adres({ widok: "nieudane" }), widok === "nieudane", `Nieudane rejestracje i transfery · ${d?.liczby.nieudane ?? 0}`)}
      </div>

      {widok === "domeny" ? (
        <>
          <form action="/domains" className="flex flex-wrap items-end gap-2.5" aria-label="Filtry domen">
            {rejestr ? <input type="hidden" name="rejestr" value={rejestr} /> : null}
            <label className="flex h-[38px] w-full max-w-[360px] items-center gap-2.5 rounded-[9px] border border-line-strong bg-background px-3 text-sm focus-within:border-primary">
              <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
              <input
                type="text"
                name="q"
                defaultValue={sp.q ?? ""}
                aria-label="Szukaj domeny: nazwa albo e-mail klienta"
                placeholder="Domena albo e-mail klienta…"
                className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Wygasa w
              <input
                type="number"
                name="wygasa"
                min={1}
                max={365}
                defaultValue={wygasa ?? ""}
                aria-label="Wygasa w ciągu dni"
                className="h-[38px] w-[80px] rounded-[9px] border border-line-strong bg-background px-2 text-sm text-foreground"
              />
              dni
            </label>
            <button type="submit" className={PRZYCISK}>
              Filtruj
            </button>
            {sp.q || rejestr || wygasa ? (
              <Link href="/domains" className="text-[13px] font-semibold text-data-hi hover:underline">
                Wyczyść
              </Link>
            ) : null}
          </form>

          {error ? (
            <p className="text-sm text-crit">{error}</p>
          ) : (
            <section className={KARTA} aria-label="Domeny">
              <div className={`${WIERSZ} !border-t-0 !py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
                <span className="min-w-0 flex-1">Domena</span>
                <span className="hidden w-[110px] md:block">Wygasa</span>
                <span className="hidden w-[90px] lg:block">Blokada</span>
                <span className="w-[170px]">Stan</span>
              </div>
              {!d || d.rows.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak domen dla tych filtrów.</div> : null}
              {d?.rows.map((r) => {
                const s = stanDomeny(r);
                return (
                  <Link key={r.id} href={`/domains/${r.id}`} className={`${WIERSZ} hover:bg-raised`}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-[12.5px] text-muted-foreground">{kto(r.user)}</span>
                    </span>
                    <span className="hidden w-[110px] font-mono text-[13px] md:block">{r.uNas ? data(r.expiresAt) : "—"}</span>
                    <span className="hidden w-[90px] text-[13px] text-muted-foreground lg:block">{r.uNas ? (r.transferLock ? "tak" : "nie") : "—"}</span>
                    <span className="w-[170px]">
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
        </>
      ) : zamowienia?.error || !zamowienia?.z ? (
        <p className="text-sm text-crit">{zamowienia?.error ?? "Nie udało się pobrać zamówień."}</p>
      ) : (
        <>
          <section className={KARTA} aria-label="Nieudane rejestracje i transfery" data-sekcja="nieudane">
            <div className={`${WIERSZ} !border-t-0 font-display text-[15px] font-bold`}>Nieudane rejestracje i transfery</div>
            {zamowienia.z.nieudane.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Nic nie czeka na ponowienie.</div> : null}
            {zamowienia.z.nieudane.map((o) => (
              <div key={o.id} className={`${WIERSZ} flex-wrap`} data-zamowienie={o.id}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">
                    {o.domainName} · {TYP_ZAMOWIENIA[o.type] ?? o.type}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    <Link href={`/customers/${o.userId}`} className="hover:underline">
                      {kto(o.user)}
                    </Link>{" "}
                    · {data(o.createdAt)} · {o.priceAmount ? `${o.priceAmount} ${o.currency}` : "—"}
                  </span>
                  {o.lastError ? <span className="break-all text-[12px] text-crit">{o.lastError}</span> : null}
                </span>
                <span className="w-[120px]">
                  <Pigulka ton={STAN_ZAMOWIENIA[o.status]?.ton ?? "muted"} className="!text-xs">
                    {STAN_ZAMOWIENIA[o.status]?.t ?? o.status}
                  </Pigulka>
                </span>
                <span className="w-full sm:w-[280px]">
                  <PonowZamowienie orderId={o.id} domena={o.domainName} typ={o.type} kwota={o.priceAmount} zablokowane={zapis} moznaPonowic={!!o.moznaPonowic} />
                </span>
              </div>
            ))}
          </section>

          <section className={KARTA} aria-label="Transfery u rejestratora" data-sekcja="w-toku">
            <div className={`${WIERSZ} !border-t-0 flex-wrap`}>
              <span className="flex-1 font-display text-[15px] font-bold">Transfery czekające u rejestratora</span>
              <SprawdzTransfery zablokowane={zapis} />
            </div>
            {zamowienia.z.wToku.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak transferów w toku.</div> : null}
            {zamowienia.z.wToku.map((o) => (
              <div key={o.id} className={WIERSZ}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{o.domainName}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {kto(o.user)} · zlecony {data(o.submittedAt)}
                  </span>
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
