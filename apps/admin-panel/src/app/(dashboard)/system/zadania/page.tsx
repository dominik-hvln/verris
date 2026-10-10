import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { plForm } from "@/lib/pl";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { KARTA, NaglowekKarty, Pigulka, WIERSZ } from "@/components/v2";
import { czasTrwania, ocena, posortuj, type Ocena, type StanZadania } from "./dane";
import { UruchomZadanie } from "./uruchom-zadanie";

export const dynamic = "force-dynamic";

const kiedy = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
const PIGULKA: Record<Ocena, { ton: "ok" | "warn" | "crit" | "muted"; tekst: string }> = {
  zalegle: { ton: "crit", tekst: "nie biegnie" },
  blad: { ton: "crit", tekst: "błąd" },
  brak: { ton: "muted", tekst: "bez przebiegu" },
  ok: { ton: "ok", tekst: "działa" },
};

/**
 * F2.8 (OJ-01) — System → Zadania w tle: ostatni przebieg, czas, błąd, następny termin (GET /admin/zadania-w-tle,
 * NODES_VIEW). „Uruchom teraz” — tylko administrator i tylko zadania z białej listy (decyduje API: mozeUruchomic).
 * Wzór: WHMCS Automation Status https://docs.whmcs.com/9-0/system/automation/automation-status/
 */
export default async function ZadaniaWTlePage() {
  const bramka = await bramkaStrony("/system/zadania");
  if (bramka) return bramka;
  let lista: StanZadania[];
  try {
    lista = posortuj(await adminApi<StanZadania[]>("/admin/zadania-w-tle"));
  } catch (e) {
    return <BladStrony blad={e} tytul="Zadania w tle" />;
  }
  const zalegle = lista.filter((z) => z.zalegle).length;
  const zBledem = lista.filter((z) => ocena(z) === "blad").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Zadania w tle <Pomoc id="zadania-w-tle" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Automaty API: kiedy biegły, ile trwały, czy rzuciły błąd i kiedy pobiegną znowu. Historia z 30 dni.
        </p>
      </header>

      {zalegle > 0 ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" data-alert="zalegle">
          {zalegle} {plForm(zalegle, "zadanie nie biegło", "zadania nie biegły", "zadań nie biegło")} od dwóch terminów z harmonogramu.
        </div>
      ) : null}

      <section className={KARTA} aria-labelledby="zadania" data-karta="zadania">
        <NaglowekKarty id="zadania" tytul={`${lista.length} ${plForm(lista.length, "zadanie", "zadania", "zadań")}${zBledem ? ` · z błędem: ${zBledem}` : ""}`} />
        {lista.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zadań w rejestrze.</div> : null}
        {lista.map((z) => {
          const o = ocena(z);
          const nazwa = z.nazwa ?? z.klucz;
          return (
            <div key={z.klucz} className={`${WIERSZ} items-start`} data-zadanie={z.klucz}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <span className="font-medium">{nazwa}</span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {z.klucz} · {z.harmonogram}
                  {z.strefa ? ` (${z.strefa})` : ""}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  {z.ostatni
                    ? `Ostatnio: ${kiedy(z.ostatni.start)} · ${czasTrwania(z.ostatni.czasMs)}${z.ostatni.reczne ? " · ręcznie" : ""}`
                    : "Brak przebiegu w ostatnich 30 dniach"}
                  {z.nastepny ? ` · następnie: ${kiedy(z.nastepny)}` : ""}
                  {z.trwaOd ? ` · trwa od ${kiedy(z.trwaOd)}` : ""}
                </span>
                {z.ostatniBlad ? (
                  <span className="text-[12.5px] text-red-300 [overflow-wrap:anywhere]">
                    Ostatni błąd ({kiedy(z.ostatniBlad.start)}): {z.ostatniBlad.blad ?? "bez treści"}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <Pigulka ton={PIGULKA[o].ton} className="!text-xs">
                  {PIGULKA[o].tekst}
                </Pigulka>
                {z.mozeUruchomic ? <UruchomZadanie klucz={z.klucz} nazwa={nazwa} /> : null}
              </span>
            </div>
          );
        })}
      </section>
      <p className="text-xs text-muted-foreground">
        Błąd widać, gdy zadanie zakończyło się wyjątkiem. Zadania, które same łapią błędy i tylko je logują, są tu „działa” — szczegóły w Błędach aplikacji i w logu API.
      </p>
    </div>
  );
}
