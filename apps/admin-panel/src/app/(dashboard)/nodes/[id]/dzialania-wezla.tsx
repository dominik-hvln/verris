import Link from "next/link";
import { KARTA } from "@/components/v2";
import { Pomoc } from "@/components/pomoc";
import { akcjeWezla, type DostepDoAkcji, type DzialanieNaKarcie, type GrupaAkcji, type WezelDlaAkcji } from "@/lib/akcje/wezel";

/**
 * 10.10 (Dominik nie mógł znaleźć ponownego Onboard LIVE — był tylko w kreatorze) — wszystkie działania
 * na węźle w jednym miejscu, na Przeglądzie karty. Lista pochodzi z rejestru lib/akcje/wezel.ts; pozycja
 * prowadzi do miejsca, gdzie działanie się uruchamia. Bez uprawnień — wyszarzona z dymkiem.
 */
export function DzialaniaWezla({ wezel, dostep }: { wezel: WezelDlaAkcji; dostep: DostepDoAkcji }) {
  const grupy = new Map<GrupaAkcji, DzialanieNaKarcie[]>();
  for (const d of akcjeWezla(wezel, dostep)) grupy.set(d.grupa, [...(grupy.get(d.grupa) ?? []), d]);
  return (
    <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="dzialania-wezla">
      <h2 id="dzialania-wezla" className="font-display text-[17px] font-bold">
        Działania
      </h2>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...grupy].map(([grupa, lista]) => (
          <div key={grupa} className="flex flex-col gap-2">
            <h3 className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{grupa}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lista.map((d) => (
                <li key={d.id} className="flex flex-col" data-akcja={d.id}>
                  <span className="flex items-center gap-1">
                    {d.zablokowane ? (
                      <span aria-disabled="true" title={d.zablokowane} className="cursor-not-allowed text-sm font-semibold text-muted-foreground opacity-60">
                        {d.nazwa}
                        <span className="sr-only"> — {d.zablokowane}</span>
                      </span>
                    ) : (
                      <Link href={d.href} className="text-sm font-semibold text-foreground underline-offset-2 hover:underline">
                        {d.nazwa} →
                      </Link>
                    )}
                    {d.pomocId ? <Pomoc id={d.pomocId} /> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{d.opis}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
