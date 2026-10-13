"use client";

import { useEffect, useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { KARTA, Pigulka } from "@/components/v2";
import { pobierzDiagnoze, pobierzStraznika, ustawRestartWezla, type StanStraznika, type ZdarzenieStraznika } from "./straznik-actions";

const STAN: Record<ZdarzenieStraznika["stan"], { tekst: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  naprawa: { tekst: "naprawia", ton: "warn" },
  naprawiono: { tekst: "naprawione", ton: "ok" },
  nie_naprawiono: { tekst: "nie naprawione", ton: "crit" },
  restart: { tekst: "restart węzła", ton: "crit" },
  tylko_alarm: { tekst: "alarm", ton: "warn" },
};

const czas = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "medium" }) : "—";

/**
 * 13.10 — strażnik węzła na karcie węzła: zdarzenia (objaw, kroki naprawy, wynik), pełna diagnoza zapisana przed
 * naprawą, wyłącznik restartu węzła (administrator). Strażnik działa na węźle co minutę (verris-straznik.sh).
 */
export function StraznikPanel({ serverId, isAdmin }: { serverId: string; isAdmin: boolean }) {
  const [stan, setStan] = useState<StanStraznika | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [otwarte, setOtwarte] = useState<string | null>(null);
  const [diagnoza, setDiagnoza] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    let aktywny = true;
    void pobierzStraznika(serverId).then((w) => {
      if (!aktywny) return;
      if (w.ok) setStan(w.dane);
      else setBlad(w.error);
    });
    return () => {
      aktywny = false;
    };
  }, [serverId]);

  const pokaz = (id: string) => {
    if (otwarte === id) return setOtwarte(null);
    setOtwarte(id);
    if (diagnoza[id]) return;
    start(async () => {
      const w = await pobierzDiagnoze(serverId, id);
      setDiagnoza((d) => ({ ...d, [id]: w.ok ? w.dane.diagnoza || "(pusta)" : `Błąd: ${w.error}` }));
    });
  };

  const przelacz = async () => {
    if (!stan) return;
    const nowy = !stan.restartWezla;
    const ok = await potwierdz(
      nowy
        ? "Włączyć restart węzłów przez strażnika? W ostateczności (stan jądra LVE, gdy restart LiteSpeed i CageFS nie pomogły) strażnik zrestartuje węzeł — najwyżej raz na dobę, z alarmem przed i po. Dotyczy całej floty."
        : "Wyłączyć restart węzłów przez strażnika? Przy awarii jądra strażnik tylko zaalarmuje — restart zrobisz ręcznie. Dotyczy całej floty.",
      { akcja: nowy ? "Włącz" : "Wyłącz", niebezpieczne: !nowy },
    );
    if (!ok) return;
    start(async () => {
      const w = await ustawRestartWezla(serverId, nowy);
      if (w.ok) setStan({ ...stan, restartWezla: w.dane.restartWezla });
      else setBlad(w.error);
    });
  };

  return (
    <section id="straznik" className={`${KARTA} flex flex-col gap-3 p-5 scroll-mt-4`} aria-labelledby="straznik-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="straznik-h" className="font-display text-[17px] font-bold">
          Strażnik węzła
        </h2>
        {stan ? (
          <span className="text-xs text-muted-foreground">
            Restart węzła przez strażnika: <strong>{stan.restartWezla ? "włączony" : "wyłączony"}</strong>
            {isAdmin ? (
              <button type="button" onClick={() => void przelacz()} disabled={pending} className="ml-2 underline hover:text-foreground">
                {stan.restartWezla ? "Wyłącz" : "Włącz"}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Co minutę sprawdza izolację kont (LVE), serie błędów 503, usługi i dysk. Przy awarii zapisuje diagnozę, naprawia
        (restart LiteSpeed → odświeżenie CageFS → w ostateczności restart węzła) i alarmuje administratorów.
      </p>
      {blad ? <p className="text-xs text-rose-300">{blad}</p> : null}
      {stan && stan.zdarzenia.length === 0 ? <p className="text-sm text-muted-foreground">Brak zdarzeń.</p> : null}
      {stan && stan.zdarzenia.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {stan.zdarzenia.map((z) => (
            <li key={z.id} className="py-2" data-zdarzenie={z.stan}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pigulka ton={STAN[z.stan].ton}>{STAN[z.stan].tekst}</Pigulka>
                <span className="font-semibold">{z.nazwa}</span>
                <span className="text-xs text-muted-foreground">wykryto {czas(z.wykrytoAt)}</span>
                {z.zakonczonoAt ? <span className="text-xs text-muted-foreground">· koniec {czas(z.zakonczonoAt)}</span> : null}
              </div>
              <p className="mt-1 text-xs">{z.objaw}</p>
              <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground">
                {z.kroki.map((k, i) => (
                  <li key={i}>
                    {k.krok}: {k.wynik}
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => pokaz(z.id)} className="mt-1 text-xs underline text-muted-foreground hover:text-foreground">
                {otwarte === z.id ? "Ukryj diagnozę" : "Pokaż diagnozę"}
              </button>
              {otwarte === z.id ? (
                <div className="mt-2">
                  {z.katalog ? <p className="text-[11px] text-muted-foreground">Pełna diagnoza na węźle: {z.katalog}</p> : null}
                  <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-3 text-[11px]">{diagnoza[z.id] ?? "Wczytywanie…"}</pre>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
