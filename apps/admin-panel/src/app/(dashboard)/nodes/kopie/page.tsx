import { adminApi } from "@/lib/api";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { KARTA, NaglowekKarty, Pigulka, WIERSZ } from "@/components/v2";
import { ostatniePerZrodlo, type ProbaOdtworzenia } from "./dane";

export const dynamic = "force-dynamic";

const kiedy = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
const czas = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
const DOBA = 24 * 60 * 60 * 1000;

/**
 * Fala 1B (zaczątek F3.3) — próby odtworzenia kopii (GET /admin/live-readiness/proby-odtworzenia, tylko ADMIN).
 * Próbę zapisuje skrypt ops/scripts/restore-drill-isolated.sh; model nie ma węzła ani konta — grupujemy po źródle kopii.
 */
export default async function ProbyOdtworzeniaPage() {
  let proby: ProbaOdtworzenia[];
  try {
    proby = await adminApi<ProbaOdtworzenia[]>("/admin/live-readiness/proby-odtworzenia");
  } catch (e) {
    return <BladStrony blad={e} tytul="Próby odtworzenia kopii" powrot={{ href: "/nodes", label: "Węzły" }} />;
  }
  const teraz = Date.now();
  const zrodla = ostatniePerZrodlo(proby);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Próby odtworzenia kopii <Pomoc id="proby-odtworzenia" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Kopia liczy się dopiero z udaną próbą odtworzenia: data, wynik, czas i kto odpowiada.</p>
      </header>

      <section className={KARTA} aria-labelledby="zrodla" data-karta="ostatnie">
        <NaglowekKarty id="zrodla" tytul="Ostatnia próba per źródło" />
        {zrodla.length === 0 ? <div className={`${WIERSZ} text-sm text-warn`}>Nie było jeszcze żadnej próby odtworzenia.</div> : null}
        {zrodla.map((p) => {
          const stara = teraz - new Date(p.finishedAt).getTime() > 30 * DOBA;
          return (
            <div key={p.source} className={WIERSZ} data-zrodlo={p.source}>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span className="break-all font-mono text-[13px]">{p.source}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {kiedy(p.finishedAt)} · {czas(p.durationSec)} · {p.owner}
                  {stara ? " · starsza niż 30 dni" : ""}
                </span>
              </span>
              <Pigulka ton={p.result === "OK" ? (stara ? "warn" : "ok") : "crit"} className="!text-xs">
                {p.result === "OK" ? "udana" : "nieudana"}
              </Pigulka>
            </div>
          );
        })}
      </section>

      <section className={KARTA} aria-labelledby="historia" data-karta="historia">
        <NaglowekKarty id="historia" tytul="Historia (50 ostatnich)" />
        {proby.map((p) => (
          <div key={p.id} className={`${WIERSZ} items-start`}>
            <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(p.finishedAt)}</span>
            <span className="flex min-w-0 flex-1 flex-col text-sm">
              <span className="break-all font-mono text-[13px]">{p.objectName}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {czas(p.durationSec)} · {p.owner}
                {p.rowCounts ? ` · ${Object.entries(p.rowCounts).map(([t, n]) => `${t}: ${n}`).join(", ")}` : ""}
              </span>
              {p.notes ? <span className="text-[12.5px] [overflow-wrap:anywhere]">{p.notes}</span> : null}
            </span>
            <Pigulka ton={p.result === "OK" ? "ok" : "crit"} className="!text-xs">
              {p.result === "OK" ? "udana" : "nieudana"}
            </Pigulka>
          </div>
        ))}
      </section>
    </div>
  );
}
