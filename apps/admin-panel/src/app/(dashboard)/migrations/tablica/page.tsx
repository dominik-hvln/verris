import Link from "next/link";
import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { plForm } from "@/lib/pl";
import { Pomoc } from "@/components/pomoc";
import type { KartaMigracji, Tablica, TerminMigracji } from "../tablica-typy";

export const dynamic = "force-dynamic";

const KOLOR_TERMINU: Record<TerminMigracji["stan"], string> = {
  "po-terminie": "border-rose-500/40 bg-rose-500/10 text-rose-200",
  blisko: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  ok: "border-white/10 bg-black/30 text-muted-foreground",
};

const kiedy = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

/**
 * D11 — tablica migracji (wzorzec kolejki migracji z Jiry): kolumny etapów obsługi, Przerywacz i najpilniejszy
 * termin na górze, przy każdej karcie — czego brakuje do następnego etapu. Działania na karcie migracji.
 */
export default async function TablicaMigracjiPage({ searchParams }: { searchParams: Promise<{ moje?: string }> }) {
  const bramka = await bramkaStrony("/migrations/tablica");
  if (bramka) return bramka;
  const { moje } = await searchParams;
  let dane: Tablica | null = null;
  let blad: string | null = null;
  try {
    dane = await adminApi<Tablica>(`/admin/migrations/tablica${moje === "1" ? "?moje=1" : ""}`);
  } catch {
    blad = "Nie udało się pobrać tablicy migracji.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] lg:text-[34px]">
            Tablica migracji <Pomoc id="tablica-migracji" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Etap przesuwasz na karcie migracji — dalej przechodzi dopiero po checkliście.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href={moje === "1" ? "/migrations/tablica" : "/migrations/tablica?moje=1"}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-muted-foreground hover:border-white/20"
          >
            {moje === "1" ? "Wszystkie" : "Tylko moje"}
          </Link>
          <Link href="/migrations" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-muted-foreground hover:border-white/20">
            Lista zleceń
          </Link>
        </div>
      </div>

      {dane && (dane.alerty.poTerminie > 0 || dane.alerty.blisko > 0) ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {dane.alerty.poTerminie > 0 ? `${dane.alerty.poTerminie} po terminie` : null}
          {dane.alerty.poTerminie > 0 && dane.alerty.blisko > 0 ? " · " : null}
          {dane.alerty.blisko > 0
            ? `${dane.alerty.blisko} ${plForm(dane.alerty.blisko, "migracja", "migracje", "migracji")} z bliskim terminem`
            : null}
        </p>
      ) : null}

      {blad || !dane ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{blad ?? "Brak danych."}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {dane.etapy.map(({ etap, nazwa }) => (
            <section key={etap} aria-label={nazwa} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2">
              <h2 className="flex items-center justify-between px-1 text-xs font-semibold uppercase text-muted-foreground">
                {nazwa}
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">{dane.kolumny[etap]?.length ?? 0}</span>
              </h2>
              {(dane.kolumny[etap] ?? []).map((k) => (
                <Karta key={k.id} k={k} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Karta({ k }: { k: KartaMigracji }) {
  return (
    <Link
      href={`/migrations/${k.id}`}
      className={`block space-y-1.5 rounded-lg border p-3 text-xs hover:border-white/25 ${
        k.przerywacz ? "border-rose-500/50 bg-rose-500/[0.06]" : "border-white/10 bg-black/40"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {k.przerywacz ? <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100">Przerywacz</span> : null}
        <span className="truncate font-medium text-white" title={k.domena}>
          {k.domena}
        </span>
      </div>
      <p className="truncate text-muted-foreground">{k.klient ?? "—"}</p>
      <p className="text-muted-foreground">
        Automat: {k.statusOpis}
        {k.needsAttention ? " · wymaga uwagi" : ""}
      </p>
      {k.termin ? (
        <p className={`rounded border px-1.5 py-0.5 ${KOLOR_TERMINU[k.termin.stan]}`}>
          {k.termin.stan === "po-terminie" ? "Po terminie: " : ""}
          {k.termin.opis} — {kiedy(k.termin.data)}
        </p>
      ) : null}
      <p className="text-muted-foreground">Prowadzi: {k.przypisany?.email ?? "nikt"}</p>
      {k.dalej && k.dalej.braki.length > 0 ? (
        <ul className="list-inside list-disc text-[11px] text-amber-200/80">
          {k.dalej.braki.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : k.dalej ? (
        <p className="text-[11px] text-emerald-300">Gotowa do przejścia dalej</p>
      ) : null}
    </Link>
  );
}
