import Link from "next/link";
import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { plForm } from "@/lib/pl";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { Select } from "@/components/select";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import { STATUS_PLATNOSCI, ZRODLO_PLATNOSCI, kiedy, type ListaNieudanych, type ZrodloPlatnosci } from "../rozliczenia-dane";
import { PonowButton } from "./ponow-button";

export const dynamic = "force-dynamic";

const OKRESY = [7, 30, 90] as const;
const NA_STRONE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * F3.6 — „Nieudane płatności” (BILLING_VIEW): Paynow, auto-doładowanie i odnowienia kartą z filtrami i przejściem do
 * klienta. Ponowić z panelu da się tylko auto-doładowanie (BILLING_MANAGE) — Paynow ponawia klient, faktury kartą
 * ponawia operator kart.
 */
export default async function NieudanePlatnosciPage({ searchParams }: { searchParams?: Promise<{ zrodlo?: string; dni?: string; klient?: string; strona?: string }> }) {
  const bramka = await bramkaStrony("/billing/nieudane");
  if (bramka) return bramka;
  const q = (await searchParams) ?? {};
  const zrodlo = q.zrodlo && q.zrodlo in ZRODLO_PLATNOSCI ? (q.zrodlo as ZrodloPlatnosci) : undefined;
  const dni = OKRESY.find((d) => String(d) === q.dni) ?? 30;
  const klient = q.klient && UUID.test(q.klient) ? q.klient : undefined;
  const strona = Math.max(1, Number.parseInt(q.strona ?? "1", 10) || 1);
  const params = new URLSearchParams({ dni: String(dni), limit: String(NA_STRONE), offset: String((strona - 1) * NA_STRONE) });
  if (zrodlo) params.set("zrodlo", zrodlo);
  if (klient) params.set("userId", klient);

  let dane: ListaNieudanych;
  try {
    dane = await adminApi<ListaNieudanych>(`/admin/rozliczenia/nieudane-platnosci?${params.toString()}`);
  } catch (e) {
    return <BladStrony blad={e} tytul="Nieudane płatności" powrot={{ href: "/billing", label: "Portfel i płatności" }} />;
  }
  const brakZmian = brakUprawnienia("BILLING_MANAGE", await fetchStaffAccess());
  const stron = Math.max(1, Math.ceil(dane.total / NA_STRONE));
  const href = (s: number) => {
    const p = new URLSearchParams({ dni: String(dni) });
    if (zrodlo) p.set("zrodlo", zrodlo);
    if (klient) p.set("klient", klient);
    if (s > 1) p.set("strona", String(s));
    return `/billing/nieudane?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Eyebrow>Finanse · Płatności</Eyebrow>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Nieudane płatności <Pomoc id="nieudane-platnosci" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Odrzucone i niedokończone płatności z ostatnich {dni} dni. Ponowić można auto-doładowanie z zapisanej karty.
        </p>
      </header>

      <form method="get" className={`${KARTA} grid grid-cols-1 items-end gap-3 p-4 md:grid-cols-4`}>
        <div>
          <label htmlFor="nieudane-zrodlo" className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Źródło</label>
          <Select id="nieudane-zrodlo" name="zrodlo" defaultValue={zrodlo ?? ""} options={[{ value: "", label: "— wszystkie —" }, ...Object.entries(ZRODLO_PLATNOSCI).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div>
          <label htmlFor="nieudane-dni" className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Okres</label>
          <Select id="nieudane-dni" name="dni" defaultValue={String(dni)} options={OKRESY.map((d) => ({ value: String(d), label: `${d} dni` }))} />
        </div>
        {klient ? <input type="hidden" name="klient" value={klient} /> : <span />}
        <div className="flex gap-2">
          <button type="submit" className={PRZYCISK}>
            Filtruj
          </button>
          <Link href="/billing/nieudane" className={PRZYCISK}>
            Wyczyść
          </Link>
        </div>
        {klient ? (
          <p className="text-[11px] text-amber-300 md:col-span-4">
            Tylko klient <Link href={`/customers/${klient}?sekcja=rozliczenia`} className="font-mono underline">{klient.slice(0, 8)}</Link> ·{" "}
            <Link href={`/billing/nieudane?dni=${dni}`} className="underline">wszyscy</Link>
          </p>
        ) : null}
      </form>

      <section className={KARTA} aria-label="Nieudane płatności" data-lista="nieudane">
        <div className={`${WIERSZ} !border-t-0 !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
          <span className="w-[120px]">Kiedy</span>
          <span className="flex-1">Klient i powód</span>
          <span className="w-[110px] text-right">Kwota</span>
          <span className="w-[120px]">Stan</span>
          <span className="w-[150px]">Ponowienie</span>
        </div>
        {dane.wiersze.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak nieudanych płatności w tym okresie.</div> : null}
        {dane.wiersze.map((w) => {
          const st = STATUS_PLATNOSCI[w.status] ?? { t: w.status, ton: "muted" as const };
          return (
            <div key={w.id} className={WIERSZ} data-zrodlo={w.zrodlo}>
              <span className="w-[120px] font-mono text-xs text-muted-foreground">{kiedy(w.kiedy)}</span>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <Link href={`/customers/${w.klient.id}?sekcja=rozliczenia`} className="truncate font-semibold hover:underline">
                  {w.klient.email ?? w.klient.id.slice(0, 8)}
                </Link>
                <span className="text-[12.5px] text-muted-foreground">
                  {[ZRODLO_PLATNOSCI[w.zrodlo], w.powod, w.referencja].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="w-[110px] text-right font-mono text-[13px]">{w.kwota ? `${w.kwota} ${w.waluta === "PLN" ? "zł" : w.waluta}` : "—"}</span>
              <span className="w-[120px]">
                <Pigulka ton={st.ton} className="!text-xs">
                  {st.t}
                </Pigulka>
              </span>
              <span className="flex w-[150px] flex-col gap-1">
                {w.ponowienie.mozliwe && !brakZmian ? <PonowButton userId={w.klient.id} kwota={w.kwota} /> : null}
                <span className="text-[11.5px] text-muted-foreground">{w.ponowienie.mozliwe && brakZmian ? `${brakZmian}.` : w.ponowienie.uwaga}</span>
              </span>
            </div>
          );
        })}
      </section>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {dane.total} {plForm(dane.total, "płatność", "płatności", "płatności")}
          {dane.ucieto ? " · lista ucięta — zawęź okres albo źródło" : ""}
        </span>
        {stron > 1 ? (
          <span className="flex gap-2">
            {strona > 1 ? <Link href={href(strona - 1)} className={PRZYCISK}>Poprzednia</Link> : null}
            <span>
              {strona} / {stron}
            </span>
            {strona < stron ? <Link href={href(strona + 1)} className={PRZYCISK}>Następna</Link> : null}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Saldo i ruchy portfela klienta są na karcie klienta, w zakładce Rozliczenia.</p>
    </div>
  );
}
