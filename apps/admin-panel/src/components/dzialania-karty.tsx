import Link from "next/link";
import { KARTA } from "@/components/v2";
import { Pomoc } from "@/components/pomoc";
import type { DzialanieNaKarcie } from "@/lib/akcje/wezel";

/**
 * Sekcja „Działania” na Przeglądzie karty (węzeł, usługa, klient, faktura — propozycja 10.10, sekcja B).
 * Lista z rejestru lib/akcje/*; pozycja prowadzi do miejsca, gdzie działanie się uruchamia. Bez uprawnień —
 * wyszarzona z dymkiem; gdy API przyjmuje wniosek — „Wyślij wniosek” prowadzi do formularza.
 */
export function DzialaniaKarty({ id, dzialania }: { id: string; dzialania: DzialanieNaKarcie[] }) {
  const grupy = new Map<string, DzialanieNaKarcie[]>();
  for (const d of dzialania) grupy.set(d.grupa, [...(grupy.get(d.grupa) ?? []), d]);
  return (
    <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby={id} data-dzialania={id}>
      <h2 id={id} className="font-display text-[17px] font-bold">
        Działania
      </h2>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...grupy].map(([grupa, lista]) => (
          <div key={grupa} className="flex flex-col gap-2">
            <h3 className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{grupa}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lista.map((d) => (
                <li key={d.id} className="flex flex-col" data-akcja={d.id}>
                  <span className="flex flex-wrap items-center gap-1">
                    {d.zablokowane ? (
                      <>
                        <span aria-disabled="true" title={d.zablokowane} className="cursor-not-allowed text-sm font-semibold text-muted-foreground opacity-60">
                          {d.nazwa}
                          <span className="sr-only"> — {d.zablokowane}</span>
                        </span>
                        {d.wniosek ? (
                          <Link href={d.href} className="text-xs font-semibold text-warn underline-offset-2 hover:underline">
                            Wyślij wniosek →
                          </Link>
                        ) : null}
                      </>
                    ) : d.zewnetrzny ? (
                      <a href={d.href} target="_blank" rel="noreferrer" className="text-sm font-semibold text-foreground underline-offset-2 hover:underline">
                        {d.nazwa} ↗
                      </a>
                    ) : (
                      <Link href={d.href} className="text-sm font-semibold text-foreground underline-offset-2 hover:underline">
                        {d.nazwa} →
                      </Link>
                    )}
                    {d.pomocId ? <Pomoc id={d.pomocId} href={d.zablokowane ? undefined : d.href} /> : null}
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
