import Link from "next/link";
import { KARTA, NaglowekKarty, Pigulka, WIERSZ } from "@/components/v2";
import { Wykres, type TonWykresu } from "@/components/wykres";
import { accounts, days } from "@/lib/pl";
import type { PrognozaWezla } from "./przeglad-data";

const NAZWA = { CPU: "CPU", RAM: "Pamięć RAM", DISK: "Dysk", IO: "IO" } as const;
const PEWNOSC = { high: "pewność wysoka", medium: "pewność średnia", low: "pewność niska" } as const;
const KROPKA = { warn: "bg-warn", crit: "bg-crit" } as const;
const DZIEN = 86_400_000;

const tonLimitu = (d: number | null): TonWykresu | null => (d == null || d > 30 ? null : d <= 7 ? "crit" : "warn");

/**
 * Podsumowanie i zalecenia prognozy. Tekst AI ma `data-ai-generated` i jedną dyskretną notkę (AI Act art. 50);
 * bez AI panel pokazuje własny opis liczb i notki nie ma.
 */
export function KomentarzPrognozy({ podsumowanie, zalecenia, komentarzAi }: { podsumowanie: string; zalecenia: string[]; komentarzAi: boolean }) {
  const ai = komentarzAi ? { "data-ai-generated": "true" } : {};
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm" {...ai}>
        {podsumowanie}
      </p>
      {zalecenia.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" {...ai}>
          {zalecenia.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
      ) : null}
      {komentarzAi ? <p className="text-[11.5px] text-muted-foreground">Zalecenia tworzy AI — decyzję podejmuje operator.</p> : null}
    </div>
  );
}

/** Karta „Prognoza węzła” na zakładce Przegląd — wszystkie liczby z panelu, AI tylko zalecenia. */
export function PrognozaWezlaKarta({ p, bazaHref }: { p: PrognozaWezla; bazaHref: string }) {
  const zasoby = p.resources.filter((r) => r.resource !== "IO");
  const z = p.zapas;
  return (
    <section className={KARTA} aria-labelledby="prognoza">
      <NaglowekKarty id="prognoza" tytul="Prognoza węzła">
        <span className="ml-auto">
          <Pigulka ton="muted" kropka={false} className="!text-xs">
            {p.dostepna ? `${p.horizonDays} dni · ${PEWNOSC[p.confidence]}` : "za mało danych"}
          </Pigulka>
        </span>
      </NaglowekKarty>
      <div className="flex flex-col gap-4 px-[18px] pb-[18px]">
        <KomentarzPrognozy podsumowanie={p.podsumowanie} zalecenia={p.zalecenia} komentarzAi={p.komentarzAi} />

        {zasoby.length ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {zasoby.map((r) => {
              const ton = tonLimitu(r.daysToLimit);
              const historia = r.historia ?? [];
              const ost = historia[historia.length - 1];
              const koniec = ost ? new Date(Date.parse(ost.t) + p.horizonDays * DZIEN).toISOString() : p.generatedAt;
              return (
                <div key={r.resource} className="flex flex-col gap-1.5 rounded-[10px] bg-background px-3 pb-2 pt-3">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{NAZWA[r.resource]}</span>
                    <span className="font-mono text-foreground">
                      {r.currentPct}% → {r.predictedPct}%
                    </span>
                  </div>
                  <Wykres
                    punkty={historia}
                    od={historia[0]?.t ?? p.generatedAt}
                    do={koniec}
                    etykieta={`${NAZWA[r.resource]} węzła, 7 dni i prognoza`}
                    ton={ton ?? (r.resource === "RAM" ? "data-2" : "data")}
                    prognoza={ost ? [ost, { t: koniec, v: r.predictedPct }] : undefined}
                  />
                  <span className={`text-[11.5px] ${ton === "crit" ? "text-crit" : ton === "warn" ? "text-warn" : "text-muted-foreground"}`}>
                    {r.daysToLimit == null ? "bez limitu w horyzoncie roku" : r.daysToLimit === 0 ? "na limicie" : `limit za ~${days(r.daysToLimit)}`}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[12.5px] text-muted-foreground">Najlepsze okno aktualizacji</dt>
            <dd>{p.oknoAktualizacji ? `${String(p.oknoAktualizacji.godzina).padStart(2, "0")}:00, śr. ${p.oknoAktualizacji.cpuProc}% CPU` : "—"}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted-foreground">Zapas puli (pakiet standardowy)</dt>
            <dd>
              {z ? `zmieści jeszcze ok. ${accounts(z.kont)}` : "węzeł nie zaraportował pojemności"}
              {z ? (
                <span className="block text-[12.5px] text-muted-foreground">
                  {z.dniDoWyczerpania != null ? `przy tempie ${z.noweKonta30d} / 30 dni — ok. ${days(z.dniDoWyczerpania)} · ` : "brak nowych kont w 30 dni · "}
                  ogranicza: {z.wymiar}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {p.sygnaly.length ? (
          <ul className="flex flex-col gap-1.5" aria-label="Sygnały">
            {p.sygnaly.map((s) => (
              <li key={s.tekst} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${KROPKA[s.ton]}`} aria-hidden />
                {s.tekst}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {p.kandydaci.length ? (
        <>
          <div className={`${WIERSZ} !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
            <span className="flex-1">Do przeniesienia — udział w CPU węzła (7 dni)</span>
          </div>
          {p.kandydaci.map((k) => (
            <div key={k.accountId} className={WIERSZ}>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{k.domena ?? k.etykieta}</span>
              <span className="font-mono text-[13px]">{k.udzialProc}%</span>
              <Link
                href={k.subscriptionId ? `/subscriptions/${k.subscriptionId}#migracja-wewnetrzna` : `${bazaHref}?sekcja=konta`}
                className="inline-flex h-8 shrink-0 items-center rounded-[9px] border border-line-strong px-3 text-[13px] font-semibold hover:border-primary"
              >
                Przenieś
              </Link>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}
