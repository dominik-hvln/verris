"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Select } from "@/components/select";
import { potwierdz } from "@/components/potwierdz";
import { wyrownajFlote, zapiszStos, type WidokStosu } from "./actions";

const etykieta = "text-[10px] font-bold uppercase tracking-wider text-neutral-500";
const przycisk =
  "inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50";

/** PB-33 — formularz manifestu i zgodność węzłów. */
export function WersjeStosu({ start }: { start: WidokStosu }) {
  const [widok, setWidok] = useState(start);
  const [f, setF] = useState({ ...start.manifest });
  const [blad, setBlad] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const m = widok.manifest;
  const zmieniony = f.php1 !== m.php1 || f.mariadb !== m.mariadb || f.daKanal !== m.daKanal || f.daCommit !== m.daCommit || f.litespeedLinia !== m.litespeedLinia;
  const opcje = (k: keyof WidokStosu["dozwolone"]) => widok.dozwolone[k].map((x) => ({ value: x.v, label: `${x.v} — ${x.opis}` }));

  const zapisz = () => {
    setBlad(null);
    setOk(null);
    run(async () => {
      const r = await zapiszStos({ daKanal: f.daKanal, daCommit: f.daCommit, php1: f.php1, mariadb: f.mariadb, litespeedLinia: f.litespeedLinia });
      if (!r.ok) return setBlad(r.error);
      setWidok(r.data);
      setF({ ...r.data.manifest });
      setOk(`Zapisano manifest ${r.data.manifest.wersja}. Nowe węzły instalują go od razu; istniejące wyrównasz przyciskiem poniżej.`);
    });
  };

  const wyrownaj = async () => {
    if (
      !(await potwierdz(
        `Wyrównać flotę do manifestu ${m.wersja}? Węzeł kanarkowy pierwszy, potem pozostałe po jednym. Domyślne PHP zmieni się na ${m.php1} dla stron bez wybranej wersji. MariaDB przejdzie do ${m.mariadb} krok po kroku, z kopią bazy przed każdym krokiem. Błąd zatrzymuje falę.`,
        { akcja: "Wyrównaj flotę", niebezpieczne: true, tytul: "Wyrównanie floty" },
      ))
    )
      return;
    setBlad(null);
    setOk(null);
    run(async () => {
      const r = await wyrownajFlote();
      if (!r.ok) return setBlad(r.error);
      setOk(r.data.kanarek ? "Fala wyrównania ruszyła od węzła kanarkowego." : "Brak węzłów z agentem do wyrównania.");
    });
  };

  const rozjazdy = widok.wezly.filter((w) => w.zgodnosc.some((p) => p.zgodne === false)).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-black/35 p-6 space-y-4" aria-labelledby="manifest">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="manifest" className="text-sm font-bold uppercase tracking-wide text-white">Manifest</h2>
          <span className="font-mono text-xs text-zinc-400">wersja {m.wersja}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><span className={etykieta}>MariaDB (z MySQL Governor)</span><Select aria-label="MariaDB" wrapperClassName="mt-1.5" value={f.mariadb} onChange={(v) => setF({ ...f, mariadb: v })} options={opcje("mariadb")} /></div>
          <div><span className={etykieta}>PHP domyślne (php1_release)</span><Select aria-label="PHP domyślne" wrapperClassName="mt-1.5" value={f.php1} onChange={(v) => setF({ ...f, php1: v })} options={opcje("php1")} /></div>
          <div><span className={etykieta}>Kanał DirectAdmina</span><Select aria-label="Kanał DirectAdmina" wrapperClassName="mt-1.5" value={f.daKanal} onChange={(v) => setF({ ...f, daKanal: v })} options={opcje("daKanal")} /></div>
          <div><span className={etykieta}>LiteSpeed Enterprise</span><Select aria-label="LiteSpeed" wrapperClassName="mt-1.5" value={f.litespeedLinia} onChange={(v) => setF({ ...f, litespeedLinia: v })} options={opcje("litespeedLinia")} /></div>
          <label className="block md:col-span-2">
            <span className={etykieta}>Build DirectAdmina (DA_COMMIT, puste = najnowszy z kanału)</span>
            <input
              value={f.daCommit}
              onChange={(e) => setF({ ...f, daCommit: e.target.value.trim() })}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 font-mono text-sm text-white"
              placeholder="np. build sprawdzony na węźle testowym"
            />
          </label>
        </div>
        <p className="text-xs text-zinc-400">
          Listy wartości pochodzą z oficjalnych źródeł: MariaDB tylko w wersjach opisanych dla CloudLinux MySQL Governor, PHP
          według wsparcia php.net. Zmiana dotyczy od razu nowych węzłów; istniejące zmieniają się dopiero po wyrównaniu.
        </p>
        <button type="button" className={przycisk} disabled={pending || !zmieniony} onClick={zapisz}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz manifest
        </button>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/35 p-6 space-y-4" aria-labelledby="zgodnosc">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="zgodnosc" className="text-sm font-bold uppercase tracking-wide text-white">Zgodność węzłów</h2>
          <span className={`text-xs ${rozjazdy ? "text-amber-300" : "text-emerald-300"}`}>
            {rozjazdy ? `${rozjazdy} z ${widok.wezly.length} węzłów różni się od manifestu` : "wszystkie węzły zgodne albo bez raportu"}
          </span>
          <button type="button" className={`${przycisk} ml-auto`} disabled={pending || widok.wezly.length === 0} onClick={() => void wyrownaj()}>
            Wyrównaj flotę
          </button>
        </div>
        {widok.wezly.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak węzłów.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
                  <th className="py-2 pr-4">Węzeł</th>
                  {widok.wezly[0].zgodnosc.map((p) => (
                    <th key={p.co} className="py-2 pr-4">{p.co} <span className="normal-case text-zinc-500">({p.oczekiwane})</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {widok.wezly.map((w) => (
                  <tr key={w.id} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-mono text-white">{w.nazwa}</td>
                    {w.zgodnosc.map((p) => (
                      <td key={p.co} className="py-2 pr-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-200">
                          {p.zgodne === true ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-label="zgodne" />
                          ) : p.zgodne === false ? (
                            <XCircle className="h-3.5 w-3.5 text-amber-300" aria-label="różni się" />
                          ) : (
                            <CircleDashed className="h-3.5 w-3.5 text-zinc-500" aria-label="brak raportu" />
                          )}
                          {p.faktyczne ?? "brak raportu"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
      {ok ? <p className="text-sm text-emerald-300" role="status">{ok}</p> : null}
    </div>
  );
}
